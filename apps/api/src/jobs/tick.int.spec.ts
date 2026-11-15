import type { NestFastifyApplication } from '@nestjs/platform-fastify';
import { eq } from 'drizzle-orm';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { outboxMessages, withTenant } from '@dafter/db';
import { useTestDb } from '@dafter/db/testing';
import { createApp } from '../app.js';
import { FakeClock } from '../clock.js';
import { ConsoleMailer } from '../student-auth/mailer.js';
import { fixtures } from '../testing/fixtures.js';

const testDb = useTestDb();
// Saturday 15:30 Cairo; the fixture group meets Saturdays at 16:00 Cairo (open from 15:30).
const clock = new FakeClock(new Date('2026-11-21T13:30:00Z'));
const mailer = new ConsoleMailer();
let app: NestFastifyApplication;
const f = fixtures(
  () => app,
  () => testDb().db,
  mailer,
);
const SECRET = 'tick-test-secret';

beforeAll(async () => {
  process.env.CRON_SECRET = SECRET;
  app = await createApp({ logger: false, db: testDb().db, clock, mailer });
  await app.init();
  await app.getHttpAdapter().getInstance().ready();
});
afterAll(() => app.close());

const tick = (auth?: string, daily = false) =>
  app.inject({
    method: 'GET',
    url: `/api/v1/internal/tick${daily ? '?daily=1' : ''}`,
    headers: auth ? { authorization: auth } : {},
  });

describe('GET /internal/tick', () => {
  it('refuses a missing or wrong secret, and is off without CRON_SECRET', async () => {
    expect((await tick()).statusCode).toBe(401);
    expect((await tick('Bearer nope')).json()).toEqual({ code: 'UNAUTHENTICATED' });
    delete process.env.CRON_SECRET;
    expect((await tick(`Bearer ${SECRET}`)).statusCode).toBe(401);
    process.env.CRON_SECRET = SECRET;
  });

  it('sends due messages every call, and runs the daily jobs with daily=1', async () => {
    const c = await f.center();
    const student = await c.newStudent({ phone: '01293000001' });
    await c.owner('POST', `students/${student}/enrollments`, { groupId: c.groupId });
    const id = (await c.owner('GET', 'sessions?from=2026-11-21&to=2026-11-21')).json()[0].id;
    await c.teacher('POST', `sessions/${id}/open`);
    await c.teacher('POST', `sessions/${id}/close`);

    const res = await tick(`Bearer ${SECRET}`);
    expect(res.statusCode).toBe(200);
    expect(res.json().sent).toBeGreaterThanOrEqual(1);
    const rows = await withTenant(testDb().db, c.workspaceId, (tx) =>
      tx.select().from(outboxMessages).where(eq(outboxMessages.workspaceId, c.workspaceId)),
    );
    expect(rows.map((r) => r.status)).toEqual(['sent']);

    // Already generated and charged: the daily jobs are no-ops but report their counts.
    expect((await tick(`Bearer ${SECRET}`, true)).json()).toEqual({
      sent: 0,
      sessions: expect.any(Number),
      charges: expect.any(Number),
      reminders: expect.any(Number),
    });
  });

  it('with OUTBOX_SEND_INLINE=1 a close sends its messages at once, no tick needed', async () => {
    process.env.OUTBOX_SEND_INLINE = '1';
    try {
      const c = await f.center();
      const student = await c.newStudent({ phone: '01293000002' });
      await c.owner('POST', `students/${student}/enrollments`, { groupId: c.groupId });
      const id = (await c.owner('GET', 'sessions?from=2026-11-28&to=2026-11-28')).json()[0].id;
      await f.openAhead(id);
      await c.teacher('POST', `sessions/${id}/close`);
      const rows = await withTenant(testDb().db, c.workspaceId, (tx) =>
        tx.select().from(outboxMessages).where(eq(outboxMessages.workspaceId, c.workspaceId)),
      );
      expect(rows.map((r) => [r.status, r.body !== null])).toEqual([['sent', true]]);
    } finally {
      delete process.env.OUTBOX_SEND_INLINE;
    }
  });
});
