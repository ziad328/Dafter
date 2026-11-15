import type { NestFastifyApplication } from '@nestjs/platform-fastify';
import { and, eq } from 'drizzle-orm';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import {
  guardians,
  ledgerEntries,
  outboxMessages,
  sessions,
  studentGuardians,
  withTenant,
} from '@dafter/db';
import { useTestDb } from '@dafter/db/testing';
import { createApp } from '../app.js';
import { FakeClock } from '../clock.js';
import { remindAllWorkspaces } from '../jobs/monthly-charges.js';
import { sendDueMessages } from '../jobs/send-outbox.js';
import { ConsoleMailer } from '../student-auth/mailer.js';
import { fixtures } from '../testing/fixtures.js';
import { MessageProvider } from './provider.js';

const testDb = useTestDb();
// Saturday 21 November, 15:30 Cairo: past the 7th, outside quiet hours. The fixture group meets
// Saturdays at 16:00 Cairo.
const clock = new FakeClock(new Date('2026-11-21T13:30:00Z'));
const mailer = new ConsoleMailer();
let app: NestFastifyApplication;
const f = fixtures(
  () => app,
  () => testDb().db,
  mailer,
);

beforeAll(async () => {
  app = await createApp({ logger: false, db: testDb().db, clock, mailer });
  await app.init();
});
afterAll(() => app.close());

class Recorder extends MessageProvider {
  sent: { phone: string; body: string }[] = [];
  async send(phone: string, body: string) {
    this.sent.push({ phone, body });
    return `test-${this.sent.length}`;
  }
  to(phone: string) {
    return this.sent.filter((m) => m.phone === phone).map((m) => m.body);
  }
}

const settings = {
  absence: true,
  sessionChange: true,
  examResult: true,
  feeOverdue: true,
  primaryOnly: false,
};

async function setup() {
  const c = await f.center();
  const rows = (trigger?: string) =>
    withTenant(testDb().db, c.workspaceId, (tx) =>
      tx
        .select()
        .from(outboxMessages)
        .where(
          and(
            eq(outboxMessages.workspaceId, c.workspaceId),
            trigger ? eq(outboxMessages.trigger, trigger) : undefined,
          ),
        ),
    );
  const enroll = async (phone: string) => {
    const id = await c.newStudent({ phone });
    await c.owner('POST', `students/${id}/enrollments`, { groupId: c.groupId });
    return id;
  };
  let receiptNo = 0;
  const pay = (studentId: string, amountPiastres: number) =>
    testDb()
      .db.insert(ledgerEntries)
      .values({
        workspaceId: c.workspaceId,
        studentId,
        groupId: c.groupId,
        type: 'payment',
        amountPiastres: -amountPiastres,
        method: 'cash',
        receiptNo: 1000 + ++receiptNo,
      });
  const session = async (date: string) =>
    (await c.owner('GET', `sessions?from=${date}&to=${date}`)).json()[0].id as string;
  return { c, rows, enroll, pay, session };
}

describe('re-check at send time', () => {
  it('a fee reminder drops a child who paid, and skips when every child paid', async () => {
    const { c, rows, enroll, pay } = await setup();
    // The fixture group has no monthly fee: give it one, so enrolling charges the month.
    await c.owner('PATCH', `groups/${c.groupId}`, { monthlyFeePiastres: 30000 });
    const [a, b] = [await enroll('01295000001'), await enroll('01295000001')]; // siblings
    const solo = await enroll('01295000002');
    await c.owner('PUT', 'message-settings', settings);
    // Counted in this center only: other test files share the worker's database.
    await remindAllWorkspaces(testDb().db, clock);
    expect(await rows('fee_overdue')).toHaveLength(2);

    // A third guardian's only child leaves (archived) with the month still owed.
    const left = await enroll('01295000003');
    await remindAllWorkspaces(testDb().db, clock);
    expect(await rows('fee_overdue')).toHaveLength(3);
    await c.owner('PATCH', `students/${left}`, { status: 'archived' });
    await pay(a, 30000); // one sibling paid in full
    await pay(solo, 10000); // part of it
    await pay(solo, 20000); // then the rest
    const phone = new Recorder();
    await sendDueMessages(testDb().db, clock, phone);

    const [siblings] = phone.to('01295000001');
    expect(siblings).toContain('300 ج.م');
    const rest = (await rows('fee_overdue')).find((r) => r.status === 'sent')!;
    expect((rest.payload as { students: { id: string }[] }).students.map((s) => s.id)).toEqual([b]);
    expect(phone.to('01295000002')).toEqual([]);
    expect(phone.to('01295000003')).toEqual([]);
    const skipped = (await rows('fee_overdue')).filter((r) => r.status === 'skipped');
    expect(skipped.map((r) => [r.skipReason, r.sentAt, r.body])).toEqual([
      ['paid', null, null],
      ['paid', null, null],
    ]);
    // The key stays taken: the job again queues nothing for that guardian this month.
    await remindAllWorkspaces(testDb().db, clock);
    expect(await rows('fee_overdue')).toHaveLength(3);
    const log = (await c.owner('GET', 'messages?status=skipped')).json();
    expect(log).toMatchObject([
      { status: 'skipped', skipReason: 'paid', trigger: 'fee_overdue' },
      { status: 'skipped', skipReason: 'paid', trigger: 'fee_overdue' },
    ]);
  });

  it('an absence drops a child marked present after close, and skips when none is left', async () => {
    const { c, rows, enroll, session } = await setup();
    const [a, b] = [await enroll('01295000011'), await enroll('01295000011')]; // siblings
    const solo = await enroll('01295000012');
    const id = await session('2026-11-21');
    await c.teacher('POST', `sessions/${id}/open`);
    await c.teacher('POST', `sessions/${id}/close`);
    // As if held by quiet hours (closed late in the evening): not sent yet.
    await withTenant(testDb().db, c.workspaceId, (tx) =>
      tx
        .update(outboxMessages)
        .set({ sendAfter: new Date('2026-11-22T06:00:00Z') })
        .where(eq(outboxMessages.workspaceId, c.workspaceId)),
    );
    expect(await rows('absence')).toHaveLength(2);

    // The next morning, before 08:00: two of the three were in class after all.
    await c.owner('PUT', `sessions/${id}/attendance/${a}`, { status: 'present' });
    await c.owner('PUT', `sessions/${id}/attendance/${solo}`, { status: 'excused' });
    const phone = new Recorder();
    await sendDueMessages(testDb().db, new FakeClock(new Date('2026-11-22T06:30:00Z')), phone);

    const siblings = phone.to('01295000011');
    expect(siblings).toHaveLength(1);
    const sent = (await rows('absence')).find((r) => r.status === 'sent')!;
    expect((sent.payload as { students: { id: string }[] }).students.map((s) => s.id)).toEqual([b]);
    expect(phone.to('01295000012')).toEqual([]);
    expect((await rows('absence')).find((r) => r.status === 'skipped')?.skipReason).toBe(
      'not_absent',
    );
  });

  it('a trigger switched off after queueing is skipped; rows without student ids still send', async () => {
    const { c, rows, enroll, session } = await setup();
    await enroll('01295000021');
    await c.teacher('POST', `sessions/${await session('2026-11-28')}/cancel`);
    const [queued] = await rows('session_cancelled');
    // A row queued before students carried an id (and before moves named the old time).
    await withTenant(testDb().db, c.workspaceId, (tx) =>
      tx.insert(outboxMessages).values({
        workspaceId: c.workspaceId,
        guardianId: queued!.guardianId,
        trigger: 'session_moved',
        payload: {
          ...(queued!.payload as object),
          students: [{ nameAr: 'قديم', nameEn: null }],
        },
        dedupeKey: 'session_moved:old-row',
        sendAfter: clock.now(),
      }),
    );
    const phone = new Recorder();
    await sendDueMessages(testDb().db, clock, phone);
    // The old move wording, since the row has no old time.
    expect(phone.to('01295000021').at(-1)).toMatch(/تم تغيير موعد حصة .+ إلى /);

    await c.teacher('POST', `sessions/${await session('2026-12-05')}/cancel`);
    await c.owner('PUT', 'message-settings', { ...settings, sessionChange: false });
    await sendDueMessages(testDb().db, clock, phone);
    const skipped = (await rows('session_cancelled')).filter((r) => r.status === 'skipped');
    expect(skipped.map((r) => r.skipReason)).toEqual(['trigger_off']);
    expect(phone.to('01295000021')).toHaveLength(2);
  });
});

describe('late corrections', () => {
  it('a manual absent after close tells that guardian once; a second change sends nothing', async () => {
    const { c, rows, enroll, session } = await setup();
    const [a, b] = [await enroll('01295000031'), await enroll('01295000032')];
    const id = await session('2026-11-21');
    await c.teacher('POST', `sessions/${id}/open`);
    await c.teacher('PUT', `sessions/${id}/attendance/${a}`, { status: 'present' });
    await c.teacher('PUT', `sessions/${id}/attendance/${b}`, { status: 'present' });
    // Absent while still open: the close sends it, not the mark.
    await c.teacher('PUT', `sessions/${id}/attendance/${b}`, { status: 'absent' });
    expect(await rows('absence')).toHaveLength(0);
    await c.teacher('PUT', `sessions/${id}/attendance/${b}`, { status: 'present' });
    await c.teacher('POST', `sessions/${id}/close`);
    expect(await rows('absence')).toHaveLength(0);

    await c.teacher('PUT', `sessions/${id}/attendance/${a}`, { status: 'absent' });
    await c.teacher('PUT', `sessions/${id}/attendance/${a}`, { status: 'absent' });
    const queued = await rows('absence');
    expect(queued).toHaveLength(1);
    expect((queued[0]!.payload as { students: { id: string }[] }).students[0]!.id).toBe(a);
    // Present again after it was sent: nothing new (documented).
    await sendDueMessages(testDb().db, clock, new Recorder());
    await c.teacher('PUT', `sessions/${id}/attendance/${a}`, { status: 'present' });
    await c.teacher('PUT', `sessions/${id}/attendance/${a}`, { status: 'absent' });
    expect(await rows('absence')).toHaveLength(1);

    // A fix to a session that ended more than 2 days ago is record-keeping: nobody is texted.
    await withTenant(testDb().db, c.workspaceId, (tx) =>
      tx
        .update(sessions)
        .set({
          startsAt: new Date('2026-11-14T14:00:00Z'),
          endsAt: new Date('2026-11-14T15:30:00Z'),
        })
        .where(eq(sessions.id, id)),
    );
    await c.teacher('PUT', `sessions/${id}/attendance/${b}`, { status: 'absent' });
    expect(await rows('absence')).toHaveLength(1);
  });
});

describe('primary guardian only', () => {
  it('messages only the primary guardian when switched on, every guardian when off', async () => {
    const { c, rows, enroll, session } = await setup();
    const student = await enroll('01295000041');
    const [second] = await withTenant(testDb().db, c.workspaceId, async (tx) => {
      const [g] = await tx
        .insert(guardians)
        .values({ workspaceId: c.workspaceId, phone: '01295000042', relation: 'father' })
        .returning();
      await tx
        .insert(studentGuardians)
        .values({ workspaceId: c.workspaceId, studentId: student, guardianId: g!.id });
      return [g!];
    });

    await c.teacher('POST', `sessions/${await session('2026-11-28')}/cancel`);
    expect(await rows('session_cancelled')).toHaveLength(2);

    await c.owner('PUT', 'message-settings', { ...settings, primaryOnly: true });
    expect((await c.owner('GET', 'message-settings')).json().primaryOnly).toBe(true);
    await c.teacher('POST', `sessions/${await session('2026-12-05')}/cancel`);
    const both = await rows('session_cancelled');
    expect(both).toHaveLength(3);
    expect(both.filter((r) => r.guardianId === second.id)).toHaveLength(1);

    // A student whose only link isn't primary still gets messages: no family goes silent.
    await withTenant(testDb().db, c.workspaceId, (tx) =>
      tx
        .update(studentGuardians)
        .set({ isPrimary: false })
        .where(eq(studentGuardians.studentId, student)),
    );
    await c.teacher('POST', `sessions/${await session('2026-12-12')}/cancel`);
    expect(await rows('session_cancelled')).toHaveLength(5);
  });
});
