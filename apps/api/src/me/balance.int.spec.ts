import type { NestFastifyApplication } from '@nestjs/platform-fastify';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { ledgerEntries } from '@dafter/db';
import { useTestDb } from '@dafter/db/testing';
import { createApp } from '../app.js';
import { FakeClock } from '../clock.js';
import { ConsoleMailer } from '../student-auth/mailer.js';
import { fixtures } from '../testing/fixtures.js';

const testDb = useTestDb();
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

describe('GET /me/balance', () => {
  it("shows my balance and entries in every center, and nobody else's", async () => {
    const c = await f.center();
    const [a, b] = [await c.newStudent(), await c.newStudent()];
    for (const id of [a, b])
      await c.owner('POST', `students/${id}/enrollments`, { groupId: c.groupId });
    const me = await f.activate(c.owner, a, 'fees@example.com');
    const sibling = await f.activate(c.owner, b, 'fees-sibling@example.com');
    const get = async (token: string) =>
      (
        await app.inject({ method: 'GET', url: '/api/v1/me/balance', headers: f.bearer(token) })
      ).json();
    // No entries yet: no center listed.
    expect(await get(me.token)).toEqual([]);

    const charge = (studentId: string, period: string) =>
      testDb()
        .db.insert(ledgerEntries)
        .values({
          workspaceId: c.workspaceId,
          studentId,
          groupId: c.groupId,
          type: 'charge',
          amountPiastres: 30000,
          period,
          createdAt: new Date(`${period}-01T08:00:00Z`),
        });
    await charge(a, '2026-10');
    await charge(a, '2026-11');
    await charge(b, '2026-11');
    const pay = async (amountPiastres: number) =>
      (
        await c.owner(
          'POST',
          'payments',
          { studentId: a, groupId: c.groupId, amountPiastres, method: 'cash' },
          { 'idempotency-key': crypto.randomUUID() },
        )
      ).json();
    await pay(30000);
    const mistake = await pay(5000);
    await c.owner('POST', `ledger/${mistake.id}/reverse`, undefined, {
      'idempotency-key': crypto.randomUUID(),
    });

    // A second center, same login.
    const d = await f.center();
    const inD = await d.newStudent();
    await d.owner('POST', `students/${inD}/enrollments`, { groupId: d.groupId });
    await f.activate(d.owner, inD, 'fees@example.com');
    await testDb().db.insert(ledgerEntries).values({
      workspaceId: d.workspaceId,
      studentId: inD,
      groupId: d.groupId,
      type: 'charge',
      amountPiastres: 12000,
      period: '2026-11',
    });

    const mine = await get(me.token);
    expect(mine).toHaveLength(2);
    expect(mine[0]).toMatchObject({ center: { nameAr: 'سنتر' }, balancePiastres: 30000 });
    expect(mine[0].entries.map((e: { type: string }) => e.type)).toEqual([
      'reversal',
      'payment',
      'payment',
      'charge',
      'charge',
    ]);
    expect(mine[0].entries[1]).toMatchObject({
      amountPiastres: -5000,
      method: 'cash',
      receiptNo: 2,
      subject: { nameAr: expect.any(String) },
    });
    expect(mine[1]).toMatchObject({ balancePiastres: 12000 });
    expect(mine[1].entries).toHaveLength(1);

    // The sibling sees only their own fee.
    const theirs = await get(sibling.token);
    expect(theirs).toHaveLength(1);
    expect(theirs[0]).toMatchObject({ balancePiastres: 30000 });
    expect(theirs[0].entries).toHaveLength(1);

    // A staff login has no student records.
    expect((await c.owner('GET', 'me/balance')).json()).toEqual([]);
  });
});
