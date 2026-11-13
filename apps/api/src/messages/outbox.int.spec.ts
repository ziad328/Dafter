import type { NestFastifyApplication } from '@nestjs/platform-fastify';
import { and, eq, sql } from 'drizzle-orm';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { outboxMessages, withTenant } from '@dafter/db';
import { useTestDb } from '@dafter/db/testing';
import { createApp } from '../app.js';
import { FakeClock } from '../clock.js';
import { MAX_ATTEMPTS, sendDueMessages } from '../jobs/send-outbox.js';
import { ConsoleMailer } from '../student-auth/mailer.js';
import { fixtures } from '../testing/fixtures.js';
import { enqueueAbsences } from './outbox.js';
import { MessageProvider } from './provider.js';

const testDb = useTestDb();
// Saturday 15:00 Cairo; the fixture group meets Saturdays at 16:00 Cairo.
const clock = new FakeClock(new Date('2026-11-21T13:00:00Z'));
const mailer = new ConsoleMailer();
let app: NestFastifyApplication;
const f = fixtures(
  () => app,
  () => testDb().db,
  mailer,
);

class Phone extends MessageProvider {
  sent: { phone: string; body: string }[] = [];
  fail = false;
  async send(phone: string, body: string) {
    if (this.fail) throw new Error('provider down');
    this.sent.push({ phone, body });
    return `test-${this.sent.length}`;
  }
}

let c: Awaited<ReturnType<typeof f.center>>;
beforeAll(async () => {
  process.env.DEV_FAKE_PHONE = '1';
  app = await createApp({ logger: false, db: testDb().db, clock, mailer });
  await app.init();
  c = await f.center();
});
afterAll(() => app.close());

const sessionOn = async (date: string) =>
  (await c.owner('GET', `sessions?from=${date}&to=${date}`)).json()[0].id as string;
const rows = (sessionId: string) =>
  withTenant(testDb().db, c.workspaceId, (tx) =>
    tx
      .select()
      .from(outboxMessages)
      .where(
        and(
          eq(outboxMessages.workspaceId, c.workspaceId),
          sql`${outboxMessages.payload}->>'sessionId' = ${sessionId}`,
        ),
      ),
  );
const setClock = (iso: string) => clock.advance(new Date(iso).getTime() - clock.now().getTime());
/** Moves the clock, then signs in again (access tokens last 15 minutes) with sessions from then. */
const freshCenter = async (iso: string) => {
  setClock(iso);
  c = await f.center();
};
const enroll = async (opts: { phone?: string; locale?: 'ar' | 'en' } = {}) => {
  const id = await c.newStudent(opts);
  await c.owner('POST', `students/${id}/enrollments`, { groupId: c.groupId });
  return id;
};

describe('absence messages on session close', () => {
  it('writes one message per guardian, merges siblings, and sends each exactly once', async () => {
    const id = await sessionOn('2026-11-21');
    await enroll({ phone: '01290000001' });
    await enroll({ phone: '01290000001' }); // sibling, same guardian
    await enroll({ phone: '01290000002', locale: 'en' });
    const present = await enroll({ phone: '01290000003' });
    await c.teacher('POST', `sessions/${id}/open`);
    await c.teacher('PUT', `sessions/${id}/attendance/${present}`, { status: 'present' });

    await c.teacher('POST', `sessions/${id}/close`);
    // A repeated close is refused, and replaying the insert itself is a no-op (dedupe_key).
    expect((await c.teacher('POST', `sessions/${id}/close`)).json().code).toBe('SESSION_NOT_OPEN');
    await withTenant(testDb().db, c.workspaceId, (tx) =>
      enqueueAbsences(tx, c.workspaceId, id, clock.now()),
    );

    const queued = await rows(id);
    expect(queued).toHaveLength(2);
    expect(
      queued.map((r) => (r.payload as { students: unknown[] }).students.length).sort(),
    ).toEqual([1, 2]);
    expect(queued.every((r) => r.sendAfter.getTime() === clock.now().getTime())).toBe(true);

    const phone = new Phone();
    await sendDueMessages(testDb().db, clock, phone);
    await sendDueMessages(testDb().db, clock, phone);
    const mine = phone.sent.filter((m) => m.phone.startsWith('0129000000'));
    expect(mine.map((m) => m.phone).sort()).toEqual(['01290000001', '01290000002']);
    expect(mine.find((m) => m.phone === '01290000001')!.body).toMatch(
      /: نود إبلاغكم بغياب .+ و.+ عن حصة/,
    );
    expect(mine.find((m) => m.phone === '01290000002')!.body).toMatch(/: .+ was absent from /);
    expect((await rows(id)).every((r) => r.status === 'sent' && r.body && r.sentAt)).toBe(true);
  });

  it('holds a message closed in quiet hours until 08:00 Cairo', async () => {
    await freshCenter('2026-11-28T20:30:00Z'); // Saturday 22:30 Cairo
    const id = await sessionOn('2026-12-05'); // opening has no "too early" check
    await enroll({ phone: '01290000011' });
    await c.teacher('POST', `sessions/${id}/open`);
    await c.teacher('POST', `sessions/${id}/close`);

    const [row] = await rows(id);
    expect(row!.sendAfter.toISOString()).toBe('2026-11-29T06:00:00.000Z');
    const phone = new Phone();
    await sendDueMessages(testDb().db, clock, phone);
    expect(phone.sent.some((m) => m.phone === '01290000011')).toBe(false);

    setClock('2026-11-29T06:00:00Z');
    await sendDueMessages(testDb().db, clock, phone);
    expect(phone.sent.filter((m) => m.phone === '01290000011')).toHaveLength(1);
  });

  it('retries with backoff, then marks the message failed', async () => {
    await freshCenter('2026-12-05T13:00:00Z');
    const id = await sessionOn('2026-12-05');
    await enroll({ phone: '01290000021' });
    await c.teacher('POST', `sessions/${id}/open`);
    await c.teacher('POST', `sessions/${id}/close`);

    const phone = new Phone();
    phone.fail = true;
    for (let i = 1; i <= MAX_ATTEMPTS; i++) {
      await sendDueMessages(testDb().db, clock, phone);
      const [row] = await rows(id);
      expect(row!.attempts).toBe(i);
      expect(row!.status).toBe(i < MAX_ATTEMPTS ? 'queued' : 'failed');
      expect(row!.sendAfter.getTime() - clock.now().getTime()).toBe(2 ** i * 60_000);
      clock.advance(2 ** i * 60_000);
    }
    phone.fail = false;
    await sendDueMessages(testDb().db, clock, phone);
    expect(phone.sent.some((m) => m.phone === '01290000021')).toBe(false);
  });

  it('writes no message when the close transaction rolls back', async () => {
    await freshCenter('2026-12-12T13:00:00Z');
    const id = await sessionOn('2026-12-12');
    await enroll({ phone: '01290000031' });
    await expect(
      withTenant(testDb().db, c.workspaceId, async (tx) => {
        await tx.execute(sql`
          insert into attendance_records (workspace_id, session_id, student_id, status, method, recorded_at)
          select workspace_id, ${id}, student_id, 'absent', 'auto_close', now()
          from enrollments where workspace_id = ${c.workspaceId} and group_id = ${c.groupId}`);
        await enqueueAbsences(tx, c.workspaceId, id, clock.now());
        expect(await tx.select().from(outboxMessages)).not.toHaveLength(0);
        throw new Error('crash before commit');
      }),
    ).rejects.toThrow('crash before commit');
    expect(await rows(id)).toHaveLength(0);
  });

  it("shows a center's sent messages on its fake phone only, and only when enabled", async () => {
    await freshCenter('2026-12-19T13:00:00Z');
    const id = await sessionOn('2026-12-19');
    await enroll({ phone: '01290000041' });
    await c.teacher('POST', `sessions/${id}/open`);
    await c.teacher('POST', `sessions/${id}/close`);
    await sendDueMessages(testDb().db, clock, new Phone());

    const own = (await c.assistant('GET', 'dev/phone')).json();
    expect(own).toEqual([expect.objectContaining({ phone: '01290000041', locale: 'ar' })]);
    const other = await f.center();
    expect((await other.owner('GET', 'dev/phone')).json()).toEqual([]);

    delete process.env.DEV_FAKE_PHONE;
    expect((await c.owner('GET', 'dev/phone')).statusCode).toBe(404);
  });
});
