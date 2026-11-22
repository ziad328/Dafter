import type { NestFastifyApplication } from '@nestjs/platform-fastify';
import { eq, sql } from 'drizzle-orm';
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import { ledgerChecks, ledgerEntries, receiptCounters, withTenant } from '@dafter/db';
import { useTestDb } from '@dafter/db/testing';
import { createApp } from '../app.js';
import { FakeClock } from '../clock.js';
import { ConsoleMailer } from '../student-auth/mailer.js';
import { fixtures } from '../testing/fixtures.js';
import { checkAllLedgers, checkLedger } from './ledger-check.js';

const testDb = useTestDb();
const clock = new FakeClock(new Date('2026-11-21T01:00:00Z'));
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

const DAY = 86_400_000;

describe('nightly ledger check', () => {
  it('finds nothing in a clean ledger, then flags a changed history, a bad reversal and the receipt counter', async () => {
    const c = await f.center();
    const studentId = await c.newStudent();
    await c.owner('POST', `students/${studentId}/enrollments`, { groupId: c.groupId });
    const db = testDb().db;
    const check = (at: Date) =>
      withTenant(db, c.workspaceId, (tx) => checkLedger(tx, c.workspaceId, at));
    const pay = async (amountPiastres: number) =>
      (
        await c.owner(
          'POST',
          'payments',
          { studentId, groupId: c.groupId, amountPiastres, method: 'cash' },
          { 'idempotency-key': crypto.randomUUID() },
        )
      ).json();
    const past = (at: Date) => ({ createdAt: new Date(at.getTime() - DAY) });
    const [charge] = await db
      .insert(ledgerEntries)
      .values({
        workspaceId: c.workspaceId,
        studentId,
        groupId: c.groupId,
        type: 'charge',
        amountPiastres: 30000,
        period: '2026-11',
        ...past(clock.now()),
      })
      .returning();
    const paid = await pay(10000);
    await c.owner('POST', `ledger/${paid.id}/reverse`, undefined, {
      'idempotency-key': crypto.randomUUID(),
    });
    // Made just now: past the 5-minute settle window, so the cutoff leaves it out.
    expect(await check(new Date(Date.now() + 60_000))).toEqual([]);
    const [first] = await db
      .select()
      .from(ledgerChecks)
      .where(eq(ledgerChecks.workspaceId, c.workspaceId));
    expect(first).toMatchObject({ entryCount: 1, sumPiastres: 30000, problems: [] });

    // The next night: a later entry is fine; the history up to the last cutoff still adds up.
    const night2 = new Date(Date.now() + DAY);
    expect(await check(night2)).toEqual([]);

    // Someone with the table-owner role edits an old charge and breaks a reversal.
    await db.execute(
      sql`update ledger_entries set amount_piastres = 25000 where id = ${charge!.id}`,
    );
    await db.execute(
      sql`update ledger_entries set amount_piastres = 9000 where reverses_entry_id = ${paid.id}`,
    );
    await db
      .update(receiptCounters)
      .set({ last: 0 })
      .where(eq(receiptCounters.workspaceId, c.workspaceId));
    const problems = await check(new Date(night2.getTime() + DAY));
    expect(problems).toEqual([
      {
        kind: 'history_changed',
        cutoff: expect.any(String),
        expected: { count: 3, sum: 30000 },
        found: { count: 3, sum: 24000 },
      },
      { kind: 'reversal_mismatch', entryId: expect.any(String) },
      { kind: 'receipt_counter_behind', last: 0, highest: paid.receiptNo },
    ]);

    // The app role can't rewrite a check (append-only, like the ledger).
    await expect(
      withTenant(db, c.workspaceId, (tx) => tx.update(ledgerChecks).set({ problems: [] })),
    ).rejects.toThrow();
  });

  it('checks every workspace and logs each problem', async () => {
    const c = await f.center();
    const studentId = await c.newStudent();
    await testDb().db.insert(ledgerEntries).values({
      workspaceId: c.workspaceId,
      studentId,
      groupId: c.groupId,
      type: 'payment',
      amountPiastres: -100,
      method: 'cash',
      receiptNo: 5, // no counter row: the next real payment would reuse number 1..5
    });
    const log = { warn: vi.fn() };
    const found = await checkAllLedgers(testDb().db, clock, log as never);
    expect(found).toBeGreaterThanOrEqual(1);
    expect(log.warn).toHaveBeenCalledWith(expect.stringContaining(c.workspaceId));
    expect(log.warn).toHaveBeenCalledWith(expect.stringContaining('receipt_counter_behind'));
  });
});
