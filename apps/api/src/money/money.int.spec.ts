import type { NestFastifyApplication } from '@nestjs/platform-fastify';
import { eq } from 'drizzle-orm';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { ledgerEntries, withTenant } from '@dafter/db';
import { useTestDb } from '@dafter/db/testing';
import { createApp } from '../app.js';
import { FakeClock } from '../clock.js';
import { chargeAllWorkspaces } from '../jobs/monthly-charges.js';
import { ConsoleMailer } from '../student-auth/mailer.js';
import { type Call, fixtures } from '../testing/fixtures.js';

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
  await app.getHttpAdapter().getInstance().ready();
});
afterAll(() => app.close());

let c: Awaited<ReturnType<typeof f.center>>;
let k = 0;
const key = () => `key-${++k}-${Date.now()}`;
const FEE = 50_000; // 500 EGP

beforeAll(async () => {
  c = await f.center();
  await c.teacher('PATCH', `groups/${c.groupId}`, { monthlyFeePiastres: FEE });
});

/** A student in the fixture group with a discount; enrolling bills this month. */
async function enrolled(discountPct = 0) {
  const id = await c.newStudent();
  const res = await c.owner('POST', `students/${id}/enrollments`, {
    groupId: c.groupId,
    discountPct,
  });
  return { id, enrollmentId: res.json().id as string };
}

const ledger = async (call: Call, id: string) =>
  (await call('GET', `students/${id}/ledger`)).json();
const pay = (call: Call, studentId: string, amountPiastres: number, idem = key(), extra = {}) =>
  call(
    'POST',
    'payments',
    { studentId, groupId: c.groupId, amountPiastres, method: 'cash', ...extra },
    { 'idempotency-key': idem },
  );

describe('monthly charges', () => {
  it('bills the joining month minus the discount, once, and the next month from the job', async () => {
    const s = await enrolled(20);
    expect(await ledger(c.owner, s.id)).toMatchObject({
      balancePiastres: 40_000,
      entries: [{ type: 'charge', amountPiastres: 40_000, period: '2026-11' }],
    });

    // Rerunning, and leaving then rejoining in the same month, add nothing.
    await chargeAllWorkspaces(testDb().db, clock);
    await c.owner('DELETE', `students/${s.id}/enrollments/${s.enrollmentId}`);
    await c.owner('POST', `students/${s.id}/enrollments`, { groupId: c.groupId, discountPct: 20 });
    expect((await ledger(c.owner, s.id)).entries).toHaveLength(1);

    await chargeAllWorkspaces(testDb().db, new FakeClock(new Date('2026-11-30T22:30:00Z')));
    // 00:30 on 1 Dec in Cairo is already December there.
    const periods = (await ledger(c.owner, s.id)).entries.map((e: { period: string }) => e.period);
    expect(periods.sort()).toEqual(['2026-11', '2026-12']);
  });
});

describe('payments', () => {
  it('needs a key; a retry returns the first entry; a reused key for another body is refused', async () => {
    const s = await enrolled();
    const missing = await c.assistant('POST', 'payments', {
      studentId: s.id,
      groupId: c.groupId,
      amountPiastres: 100,
      method: 'cash',
    });
    expect(missing.json().code).toBe('IDEMPOTENCY_KEY_REQUIRED');

    const idem = key();
    const first = await pay(c.teacher, s.id, 30_000, idem, { method: 'vodafone_cash' });
    expect(first.statusCode).toBe(201);
    expect(first.json()).toMatchObject({
      type: 'payment',
      amountPiastres: -30_000,
      method: 'vodafone_cash',
    });
    const again = await pay(c.teacher, s.id, 30_000, idem, { method: 'vodafone_cash' });
    expect(again.json()).toEqual(first.json());
    const other = await pay(c.teacher, s.id, 31_000, idem, { method: 'vodafone_cash' });
    expect([other.statusCode, other.json().code]).toEqual([409, 'IDEMPOTENCY_KEY_REUSED']);
    expect((await ledger(c.owner, s.id)).balancePiastres).toBe(FEE - 30_000);
  });

  it('gives parallel payments gapless receipt numbers, and a racing retry no number', async () => {
    const s = await enrolled();
    const twin = key();
    const results = await Promise.all([
      ...Array.from({ length: 5 }, () => pay(c.owner, s.id, 1_000)),
      pay(c.owner, s.id, 2_000, twin),
      pay(c.owner, s.id, 2_000, twin),
      pay(c.owner, s.id, 2_000, twin),
    ]);
    const ids = new Set(results.map((r) => r.json().id));
    expect(ids.size).toBe(6);
    const numbers = (await ledger(c.owner, s.id)).entries
      .map((e: { receiptNo: number | null }) => e.receiptNo)
      .filter(Boolean)
      .sort((a: number, b: number) => a - b);
    expect(numbers).toHaveLength(6);
    expect(numbers.at(-1) - numbers[0]).toBe(5);
    const next = (await pay(c.owner, s.id, 500)).json().receiptNo;
    expect(next).toBe(numbers.at(-1) + 1);
  });

  it('follows group scope and workspace boundaries', async () => {
    const s = await enrolled();
    const res = await pay(c.assistant, s.id, 1_000);
    expect([res.statusCode, res.json().code]).toEqual([404, 'GROUP_NOT_FOUND']);

    const other = await f.center();
    expect((await other.owner('GET', `students/${s.id}/ledger`)).json().code).toBe(
      'STUDENT_NOT_FOUND',
    );
    const foreign = await other.owner(
      'POST',
      'payments',
      { studentId: s.id, groupId: other.groupId, amountPiastres: 1_000, method: 'cash' },
      { 'idempotency-key': key() },
    );
    expect(foreign.json().code).toBe('STUDENT_NOT_FOUND');
    const entryId = (await pay(c.owner, s.id, 1_000)).json().id;
    expect((await other.owner('GET', `ledger/${entryId}/receipt`)).json().code).toBe(
      'ENTRY_NOT_FOUND',
    );
    expect((await c.owner('GET', `ledger/${entryId}/receipt`)).json()).toMatchObject({
      entry: { id: entryId, amountPiastres: -1_000 },
      center: { nameAr: 'سنتر' },
      timezone: 'Africa/Cairo',
    });
  });
});

describe('reversals and the append-only ledger', () => {
  it('reverses once, keeps history, and only the owner or the recorder may do it', async () => {
    const s = await enrolled();
    const payment = (await pay(c.teacher, s.id, 20_000)).json();
    const rev = (id: string, call: Call, idem = key()) =>
      call('POST', `ledger/${id}/reverse`, undefined, { 'idempotency-key': idem });

    const idem = key();
    const first = await rev(payment.id, c.teacher, idem);
    expect(first.statusCode).toBe(201);
    expect(first.json()).toMatchObject({
      type: 'reversal',
      amountPiastres: 20_000,
      reversesEntryId: payment.id,
    });
    expect((await rev(payment.id, c.teacher, idem)).json().id).toBe(first.json().id);
    expect((await rev(payment.id, c.owner)).json().code).toBe('ENTRY_ALREADY_REVERSED');
    expect((await rev(first.json().id, c.owner)).json().code).toBe('ENTRY_NOT_REVERSIBLE');

    const l = await ledger(c.owner, s.id);
    expect(l.balancePiastres).toBe(FEE);
    expect(l.entries.find((e: { id: string }) => e.id === payment.id).reversedById).toBe(
      first.json().id,
    );

    // The job's charge was recorded by nobody: only the owner reverses it.
    const charge = l.entries.find((e: { type: string }) => e.type === 'charge');
    expect((await rev(charge.id, c.teacher)).json().code).toBe('FORBIDDEN');
    expect((await rev(charge.id, c.owner)).statusCode).toBe(201);
    expect((await ledger(c.owner, s.id)).balancePiastres).toBe(0);
  });

  it('refuses UPDATE and DELETE for the app role at the database', async () => {
    const s = await enrolled();
    const tryIt = (fn: Parameters<typeof withTenant>[2]) =>
      withTenant(testDb().db, c.workspaceId, fn).then(
        () => 'ok',
        (e: { cause?: { code?: string } }) => e.cause?.code,
      );
    const where = eq(ledgerEntries.studentId, s.id);
    // 42501 = insufficient_privilege.
    expect(
      await tryIt((tx) => tx.update(ledgerEntries).set({ amountPiastres: 1 }).where(where)),
    ).toBe('42501');
    expect(await tryIt((tx) => tx.delete(ledgerEntries).where(where))).toBe('42501');
  });
});

describe('review fixes', () => {
  it('does not bill archived students', async () => {
    const s = await enrolled();
    await c.owner('PATCH', `students/${s.id}`, { status: 'archived' });
    await chargeAllWorkspaces(testDb().db, new FakeClock(new Date('2027-01-05T10:00:00Z')));
    const periods = (await ledger(c.owner, s.id)).entries.map((e: { period: string }) => e.period);
    expect(periods).toEqual(['2026-11']);
  });

  it('refuses a payment for a group the student was never in', async () => {
    const s = await enrolled();
    const [subject] = (await c.owner('GET', 'subjects')).json();
    const [grade] = (await c.owner('GET', 'grade-levels')).json();
    const other = (
      await c.teacher('POST', 'groups', {
        subjectId: subject.id,
        gradeLevelId: grade.id,
        slots: [{ weekday: 2, startTime: '10:00', endTime: '11:00' }],
      })
    ).json();
    const res = await c.teacher(
      'POST',
      'payments',
      { studentId: s.id, groupId: other.id, amountPiastres: 1_000, method: 'cash' },
      { 'idempotency-key': key() },
    );
    expect(res.json()).toMatchObject({
      code: 'STUDENT_REFERENCE_INVALID',
      details: { field: 'groupId' },
    });
  });

  it('serves receipts for payments only', async () => {
    const s = await enrolled();
    const charge = (await ledger(c.owner, s.id)).entries[0];
    expect((await c.owner('GET', `ledger/${charge.id}/receipt`)).json().code).toBe(
      'ENTRY_NOT_FOUND',
    );
  });
});
