import type { NestFastifyApplication } from '@nestjs/platform-fastify';
import { and, eq } from 'drizzle-orm';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { ledgerEntries, outboxMessages } from '@dafter/db';
import { useTestDb } from '@dafter/db/testing';
import { createApp } from '../app.js';
import { FakeClock } from '../clock.js';
import { remindAllWorkspaces } from '../jobs/monthly-charges.js';
import { sendDueMessages } from '../jobs/send-outbox.js';
import { ConsoleMailer } from '../student-auth/mailer.js';
import { fixtures } from '../testing/fixtures.js';
import { ConsoleProvider } from './provider.js';

const testDb = useTestDb();
// Saturday 21 November, 15:00 Cairo: past the 7th, outside quiet hours.
const clock = new FakeClock(new Date('2026-11-21T13:00:00Z'));
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

const on = {
  absence: true,
  sessionChange: true,
  examResult: true,
  feeOverdue: true,
  feeReminderFromDay: 7,
};

describe('monthly fee reminders', () => {
  it('reminds each guardian once a month from the 7th, siblings merged, only when switched on', async () => {
    const c = await f.center();
    let receiptNo = 0;
    const entry = (studentId: string, amountPiastres: number) =>
      testDb()
        .db.insert(ledgerEntries)
        .values({
          workspaceId: c.workspaceId,
          studentId,
          groupId: c.groupId,
          type: amountPiastres > 0 ? 'charge' : 'payment',
          amountPiastres,
          ...(amountPiastres < 0 ? { method: 'cash' as const, receiptNo: ++receiptNo } : {}),
        });
    const owes = async (phone: string, piastres: number) => {
      const id = await c.newStudent({ phone });
      await entry(id, piastres);
      return id;
    };
    await owes('01294000001', 30000);
    await owes('01294000001', 25050); // sibling, same guardian
    await owes('01294000002', 10000);
    const paid = await owes('01294000003', 20000);
    await entry(paid, -20000);
    const archived = await owes('01294000004', 5000);
    await c.owner('PATCH', `students/${archived}`, { status: 'archived' });
    const rows = () =>
      testDb()
        .db.select()
        .from(outboxMessages)
        .where(
          and(
            eq(outboxMessages.workspaceId, c.workspaceId),
            eq(outboxMessages.trigger, 'fee_overdue'),
          ),
        );

    // Off until the owner turns it on.
    expect((await c.owner('GET', 'message-settings')).json().feeOverdue).toBe(false);
    await remindAllWorkspaces(testDb().db, clock);
    expect(await rows()).toEqual([]);

    await c.owner('PUT', 'message-settings', on);
    expect(await remindAllWorkspaces(testDb().db, clock)).toBeGreaterThanOrEqual(2);
    await remindAllWorkspaces(testDb().db, clock);
    const queued = await rows();
    expect(queued).toHaveLength(2);
    expect(queued.map((r) => r.dedupeKey.split(':')[1])).toEqual(['2026-11', '2026-11']);

    await sendDueMessages(testDb().db, clock, new ConsoleProvider());
    const bodies = (await rows()).map((r) => r.body!).sort();
    expect(bodies.find((b) => b.includes('250.5 ج.م'))).toContain('300 ج.م');
    expect(bodies.some((b) => b.includes('100 ج.م'))).toBe(true);
    expect(bodies[0]).toContain('سنتر: تذكير بمصروفات شهر نوفمبر');

    // A new month: nothing before the 7th, then one more per guardian.
    await remindAllWorkspaces(testDb().db, new FakeClock(new Date('2026-12-06T10:00:00Z')));
    expect(await rows()).toHaveLength(2);
    await remindAllWorkspaces(testDb().db, new FakeClock(new Date('2026-12-07T10:00:00Z')));
    expect(await rows()).toHaveLength(4);

    // A center that starts on the 1st: January's reminders go out on the 1st, not the 7th.
    expect(
      (await c.owner('PUT', 'message-settings', { ...on, feeReminderFromDay: 29 })).statusCode,
    ).toBe(400);
    await c.owner('PUT', 'message-settings', { ...on, feeReminderFromDay: 1 });
    expect((await c.owner('GET', 'message-settings')).json().feeReminderFromDay).toBe(1);
    await remindAllWorkspaces(testDb().db, new FakeClock(new Date('2027-01-01T10:00:00Z')));
    expect(await rows()).toHaveLength(6);
  });

  it('waits for a later start day', async () => {
    const c = await f.center();
    const id = await c.newStudent({ phone: '01294000009' });
    await testDb().db.insert(ledgerEntries).values({
      workspaceId: c.workspaceId,
      studentId: id,
      groupId: c.groupId,
      type: 'charge',
      amountPiastres: 10000,
    });
    await c.owner('PUT', 'message-settings', { ...on, feeReminderFromDay: 25 });
    const count = async () =>
      (
        await testDb()
          .db.select()
          .from(outboxMessages)
          .where(eq(outboxMessages.workspaceId, c.workspaceId))
      ).length;
    await remindAllWorkspaces(testDb().db, clock); // the 21st
    expect(await count()).toBe(0);
    await remindAllWorkspaces(testDb().db, new FakeClock(new Date('2026-11-25T10:00:00Z')));
    expect(await count()).toBe(1);
  });
});
