import type { NestFastifyApplication } from '@nestjs/platform-fastify';
import { eq } from 'drizzle-orm';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { outboxMessages, withTenant } from '@dafter/db';
import { useTestDb } from '@dafter/db/testing';
import { createApp } from '../app.js';
import { FakeClock } from '../clock.js';
import { MAX_ATTEMPTS, sendDueMessages } from '../jobs/send-outbox.js';
import { ConsoleMailer } from '../student-auth/mailer.js';
import { fixtures } from '../testing/fixtures.js';
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

let c: Awaited<ReturnType<typeof f.center>>;
beforeAll(async () => {
  app = await createApp({ logger: false, db: testDb().db, clock, mailer });
  await app.init();
  c = await f.center();
});
afterAll(() => app.close());

const sessionOn = async (date: string) =>
  (await c.owner('GET', `sessions?from=${date}&to=${date}`)).json()[0].id as string;
const rows = () =>
  withTenant(testDb().db, c.workspaceId, (tx) =>
    tx.select().from(outboxMessages).where(eq(outboxMessages.workspaceId, c.workspaceId)),
  );
const ofSession = async (id: string, trigger: string) =>
  (await rows()).filter(
    (r) => r.trigger === trigger && (r.payload as { sessionId: string }).sessionId === id,
  );
const enroll = async (phone: string) => {
  const id = await c.newStudent({ phone });
  await c.owner('POST', `students/${id}/enrollments`, { groupId: c.groupId });
  return id;
};

describe('session cancelled and moved messages', () => {
  beforeAll(async () => {
    await enroll('01291000001');
    await enroll('01291000001'); // sibling
    await enroll('01291000002');
  });

  it('a cancel messages each guardian once, siblings merged', async () => {
    const id = await sessionOn('2026-11-28');
    expect((await c.teacher('POST', `sessions/${id}/cancel`)).statusCode).toBe(200);
    expect((await c.teacher('POST', `sessions/${id}/cancel`)).json().code).toBe(
      'SESSION_NOT_SCHEDULED',
    );
    const msgs = await ofSession(id, 'session_cancelled');
    expect(msgs).toHaveLength(2);
    expect(msgs.map((m) => (m.payload as { students: unknown[] }).students.length).sort()).toEqual([
      1, 2,
    ]);
  });

  it('saving a session at its current time changes nothing and messages nobody', async () => {
    const id = await sessionOn('2026-12-12');
    const res = await c.teacher('PATCH', `sessions/${id}`, {
      date: '2026-12-12',
      startTime: '16:00',
      endTime: '17:30',
    });
    expect(res.statusCode).toBe(200);
    expect(res.json().moved).toBe(false);
    expect(await ofSession(id, 'session_moved')).toHaveLength(0);
  });

  it('a move to a new time messages again; repeating the same move does not', async () => {
    const id = await sessionOn('2026-12-05');
    const to = { date: '2026-12-06', startTime: '17:00', endTime: '18:30' };
    await c.teacher('PATCH', `sessions/${id}`, to);
    await c.teacher('PATCH', `sessions/${id}`, to);
    expect(await ofSession(id, 'session_moved')).toHaveLength(2); // two guardians
    await c.teacher('PATCH', `sessions/${id}`, { ...to, startTime: '18:00', endTime: '19:00' });
    expect(await ofSession(id, 'session_moved')).toHaveLength(4);

    const phone = new Recorder();
    await sendDueMessages(testDb().db, clock, phone);
    // The last move: «حصة … الأحد 6 ديسمبر 5:00 م أصبحت الأحد 6 ديسمبر 6:00 م» (old, then new).
    expect(phone.to('01291000002').at(-1)).toMatch(/حصة .+ الأحد.+5:00 م أصبحت الأحد.+6:00 م.$/);
  });
});

describe('message settings', () => {
  it('defaults to on; only the owner changes it; off writes no messages', async () => {
    expect((await c.teacher('GET', 'message-settings')).json()).toEqual({
      absence: true,
      sessionChange: true,
      examResult: true,
      feeOverdue: false,
      primaryOnly: false,
    });
    const off = {
      absence: false,
      sessionChange: false,
      examResult: false,
      feeOverdue: false,
      primaryOnly: false,
    };
    expect((await c.assistant('PUT', 'message-settings', off)).json().code).toBe('FORBIDDEN');
    expect((await c.owner('PUT', 'message-settings', off)).json()).toEqual(off);
    expect((await c.assistant('GET', 'message-settings')).json()).toEqual(off);

    const before = (await rows()).length;
    await c.teacher('POST', `sessions/${await sessionOn('2026-12-12')}/cancel`);
    const closed = await sessionOn('2026-11-21');
    await c.teacher('POST', `sessions/${closed}/open`);
    await c.teacher('POST', `sessions/${closed}/close`);
    expect((await rows()).length).toBe(before);

    await c.owner('PUT', 'message-settings', {
      absence: true,
      sessionChange: true,
      examResult: true,
      feeOverdue: false,
    });
  });
});

describe('message log', () => {
  it('shows owner and assistant every message with its status; teachers get 403', async () => {
    const id = await sessionOn('2026-12-06'); // the session moved above
    await c.teacher('POST', `sessions/${id}/cancel`);
    const phone = new Recorder();
    phone.fail = true;
    let waited = 0;
    for (let i = 1; i <= MAX_ATTEMPTS; i++) {
      await sendDueMessages(testDb().db, clock, phone);
      clock.advance(2 ** i * 60_000);
      waited += 2 ** i * 60_000;
    }
    clock.advance(-waited); // back inside the 15-minute access token

    const failed = (await c.assistant('GET', 'messages?status=failed')).json();
    expect(failed.length).toBeGreaterThanOrEqual(2);
    expect(failed[0]).toMatchObject({
      trigger: 'session_cancelled',
      status: 'failed',
      attempts: MAX_ATTEMPTS,
      lastError: expect.stringContaining('provider down'),
      body: null,
    });
    expect(failed[0].students.length).toBeGreaterThan(0);
    const all = (await c.owner('GET', 'messages')).json();
    expect(all.some((m: { status: string }) => m.status === 'sent')).toBe(true);
    expect((await c.teacher('GET', 'messages')).json().code).toBe('FORBIDDEN');
    expect((await c.owner('GET', 'messages?status=nope')).statusCode).toBe(400);

    const other = await f.center();
    expect((await other.owner('GET', 'messages')).json()).toEqual([]);
  });
});

class Recorder extends MessageProvider {
  sent: { phone: string; body: string }[] = [];
  fail = false;
  async send(phone: string, body: string) {
    if (this.fail) throw new Error('provider down');
    this.sent.push({ phone, body });
    return `test-${this.sent.length}`;
  }
  to(phone: string) {
    return this.sent.filter((m) => m.phone === phone).map((m) => m.body);
  }
}
