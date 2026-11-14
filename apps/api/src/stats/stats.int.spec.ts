import type { NestFastifyApplication } from '@nestjs/platform-fastify';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { ledgerEntries } from '@dafter/db';
import { useTestDb } from '@dafter/db/testing';
import { createApp } from '../app.js';
import { FakeClock } from '../clock.js';
import { ConsoleMailer } from '../student-auth/mailer.js';
import { fixtures } from '../testing/fixtures.js';

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

beforeAll(async () => {
  app = await createApp({ logger: false, db: testDb().db, clock, mailer });
  await app.init();
});
afterAll(() => app.close());

describe('GET /stats/today', () => {
  it("counts today's sessions, expected and checked-in students, and the week, per center and role", async () => {
    const c = await f.center();
    const [a, b] = [await c.newStudent(), await c.newStudent()];
    for (const id of [a, b])
      await c.owner('POST', `students/${id}/enrollments`, { groupId: c.groupId });
    await c.newStudent(); // active, not enrolled

    const before = (await c.owner('GET', 'stats/today')).json();
    expect(before).toMatchObject({
      sessionsToday: 1,
      expectedToday: 2,
      checkedInToday: 0,
      activeStudents: 3,
    });
    expect(before.week).toHaveLength(7);
    expect(before.week.at(-1)).toEqual({ date: '2026-11-21', present: 0, total: 0 });

    const session = (await c.owner('GET', 'sessions?from=2026-11-21&to=2026-11-21')).json()[0].id;
    await c.teacher('POST', `sessions/${session}/open`);
    await c.teacher('PUT', `sessions/${session}/attendance/${a}`, { status: 'present' });
    await c.teacher('PUT', `sessions/${session}/attendance/${b}`, { status: 'absent' });

    // The teacher sees their own group; students count only through their groups.
    const after = (await c.teacher('GET', 'stats/today')).json();
    expect(after).toMatchObject({ sessionsToday: 1, expectedToday: 2, checkedInToday: 1 });
    expect(after.activeStudents).toBe(2);
    expect(after.week.at(-1)).toEqual({ date: '2026-11-21', present: 1, total: 2 });

    // An assistant with no teachers assigned sees no groups.
    const assistant = (await c.assistant('GET', 'stats/today')).json();
    expect(assistant).toMatchObject({ sessionsToday: 0, expectedToday: 0, checkedInToday: 0 });

    // Another center sees only its own numbers.
    const other = await f.center();
    const theirs = (await other.owner('GET', 'stats/today')).json();
    expect(theirs).toMatchObject({ expectedToday: 0, checkedInToday: 0, activeStudents: 0 });
    expect(theirs.week.at(-1)).toEqual({ date: '2026-11-21', present: 0, total: 0 });
  });
});

describe('GET /stats/collections', () => {
  it('sums payments minus their reversals by method, today and this month in Cairo, per center', async () => {
    const c = await f.center();
    const studentId = await c.newStudent();
    const base = { workspaceId: c.workspaceId, studentId, groupId: c.groupId };
    let receiptNo = 0;
    const pay = async (
      pounds: number,
      method: 'cash' | 'vodafone_cash' | 'instapay',
      at: string,
    ) => {
      const [row] = await testDb()
        .db.insert(ledgerEntries)
        .values({
          ...base,
          type: 'payment',
          amountPiastres: -pounds * 100,
          method,
          receiptNo: ++receiptNo,
          createdAt: new Date(at),
        })
        .returning();
      return row!;
    };
    const reverse = (e: typeof ledgerEntries.$inferSelect, at: string) =>
      testDb()
        .db.insert(ledgerEntries)
        .values({
          ...base,
          type: 'reversal',
          amountPiastres: -e.amountPiastres,
          reversesEntryId: e.id,
          createdAt: new Date(at),
        });

    await pay(100, 'cash', '2026-11-21T10:00:00Z');
    await pay(50, 'vodafone_cash', '2026-11-20T23:30:00Z'); // 01:30 on the 21st in Cairo
    const instapay = await pay(30, 'instapay', '2026-11-20T21:30:00Z'); // 23:30 on the 20th
    await pay(70, 'cash', '2026-10-31T21:30:00Z'); // 23:30 on Oct 31: last month
    await pay(20, 'cash', '2026-11-21T14:00:00Z'); // after "now"
    await reverse(instapay, '2026-11-21T09:00:00Z'); // refunded today
    const [charge] = await testDb()
      .db.insert(ledgerEntries)
      .values({ ...base, type: 'charge', amountPiastres: 40000, period: '2026-11' })
      .returning();
    await reverse(charge!, '2026-11-21T09:00:00Z');

    const res = await c.owner('GET', 'stats/collections');
    expect(res.statusCode).toBe(200);
    expect(res.json()).toEqual({
      today: { cash: 10000, vodafone_cash: 5000, instapay: -3000, total: 12000 },
      month: { cash: 10000, vodafone_cash: 5000, instapay: 0, total: 15000 },
    });
    expect((await c.assistant('GET', 'stats/collections')).json().month.total).toBe(15000);
    expect((await c.teacher('GET', 'stats/collections')).json().code).toBe('FORBIDDEN');

    const other = await f.center();
    expect((await other.owner('GET', 'stats/collections')).json()).toEqual({
      today: { cash: 0, vodafone_cash: 0, instapay: 0, total: 0 },
      month: { cash: 0, vodafone_cash: 0, instapay: 0, total: 0 },
    });
  });
});
