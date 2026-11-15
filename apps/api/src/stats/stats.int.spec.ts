import type { NestFastifyApplication } from '@nestjs/platform-fastify';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { and, eq } from 'drizzle-orm';
import { assistantScopes, ledgerEntries, memberships, students as studentsTable } from '@dafter/db';
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
    // An assistant counts only their teachers' groups: none until scoped to this group's teacher.
    expect((await c.assistant('GET', 'stats/collections')).json().month.total).toBe(0);
    const role = async (r: 'teacher' | 'assistant') =>
      (
        await testDb()
          .db.select()
          .from(memberships)
          .where(and(eq(memberships.workspaceId, c.workspaceId), eq(memberships.role, r)))
      )[0]!.id;
    await testDb()
      .db.insert(assistantScopes)
      .values({
        workspaceId: c.workspaceId,
        membershipId: await role('assistant'),
        teacherMembershipId: await role('teacher'),
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

describe('GET /stats/owing', () => {
  it("lists every debtor biggest first, past 50, and an assistant sees only their teachers' groups", async () => {
    const c = await f.center();
    const db = testDb().db;
    const [teacher] = await db
      .select()
      .from(memberships)
      .where(and(eq(memberships.workspaceId, c.workspaceId), eq(memberships.role, 'teacher')));
    const [assistant] = await db
      .select()
      .from(memberships)
      .where(and(eq(memberships.workspaceId, c.workspaceId), eq(memberships.role, 'assistant')));
    const [grade] = (await c.owner('GET', 'grade-levels')).json();
    const [subject] = (await c.owner('GET', 'subjects')).json();
    // A second group the owner teaches, outside the assistant's scope.
    const ownGroup = (
      await c.owner('POST', 'groups', {
        subjectId: subject.id,
        gradeLevelId: grade.id,
        slots: [{ weekday: 1, startTime: '10:00', endTime: '11:00' }],
      })
    ).json().id as string;

    const students = await db
      .insert(studentsTable)
      .values(
        Array.from({ length: 55 }, (_, i) => ({
          workspaceId: c.workspaceId,
          nameAr: `مدين ${i}`,
          nameSearch: `مدين ${i}`,
          gradeLevelId: grade.id,
        })),
      )
      .returning({ id: studentsTable.id });
    const charge = (studentId: string, groupId: string, piastres: number, period: string) => ({
      workspaceId: c.workspaceId,
      studentId,
      groupId,
      type: 'charge' as const,
      amountPiastres: piastres,
      period,
    });
    // Student i owes (i + 1) pounds in the teacher's group; student 0 also owes 1000 in the owner's.
    await db
      .insert(ledgerEntries)
      .values([
        ...students.map((s, i) => charge(s.id, c.groupId, (i + 1) * 100, '2026-11')),
        charge(students[0]!.id, ownGroup, 100_000, '2026-11'),
      ]);
    // Student 1 paid in full: off the list.
    await db.insert(ledgerEntries).values({
      workspaceId: c.workspaceId,
      studentId: students[1]!.id,
      groupId: c.groupId,
      type: 'payment',
      amountPiastres: -200,
      method: 'cash',
      receiptNo: 1,
    });

    const all = (await c.owner('GET', 'stats/owing')).json() as {
      id: string;
      balancePiastres: number;
      gradeLevel: { id: string };
    }[];
    expect(all).toHaveLength(54);
    expect(all[0]).toMatchObject({ id: students[0]!.id, balancePiastres: 100_100 });
    expect(all[0]!.gradeLevel.id).toBe(grade.id);
    expect(all[1]).toMatchObject({ id: students[54]!.id, balancePiastres: 5500 });
    expect(all.some((s) => s.id === students[1]!.id)).toBe(false);

    // Unscoped, the assistant sees nobody; scoped to the teacher, only that group's balances.
    expect((await c.assistant('GET', 'stats/owing')).json()).toEqual([]);
    await db.insert(assistantScopes).values({
      workspaceId: c.workspaceId,
      membershipId: assistant!.id,
      teacherMembershipId: teacher!.id,
    });
    const scoped = (await c.assistant('GET', 'stats/owing')).json();
    expect(scoped).toHaveLength(54);
    expect(scoped.find((s: { id: string }) => s.id === students[0]!.id).balancePiastres).toBe(100);

    expect((await c.teacher('GET', 'stats/owing')).json().code).toBe('FORBIDDEN');
    expect((await (await f.center()).owner('GET', 'stats/owing')).json()).toEqual([]);
  });
});

describe('GET /stats/trends', () => {
  it('gives 8 Saturday weeks of attendance and exams per visible group, and 6 months of money', async () => {
    const c = await f.center();
    const [a, b] = [await c.newStudent(), await c.newStudent()];
    for (const id of [a, b])
      await c.owner('POST', `students/${id}/enrollments`, { groupId: c.groupId });
    const session = (await c.owner('GET', 'sessions?from=2026-11-21&to=2026-11-21')).json()[0].id;
    await c.teacher('POST', `sessions/${session}/open`);
    await c.teacher('PUT', `sessions/${session}/attendance/${a}`, { status: 'present' });
    await c.teacher('PUT', `sessions/${session}/attendance/${b}`, { status: 'absent' });
    const exam = (
      await c.teacher('POST', `groups/${c.groupId}/exams`, {
        title: 'شهر',
        heldOn: '2026-11-21',
        maxScore: 20,
      })
    ).json().id;
    await c.teacher('PUT', `exams/${exam}/results`, {
      results: [
        { studentId: a, score: 15, absent: false },
        { studentId: b, score: null, absent: true },
      ],
    });
    await c.teacher('POST', `groups/${c.groupId}/exams`, {
      title: 'قديم',
      heldOn: '2026-09-01',
      maxScore: 20,
    });
    let receiptNo = 0;
    const pay = (pounds: number, at: string) =>
      testDb()
        .db.insert(ledgerEntries)
        .values({
          workspaceId: c.workspaceId,
          studentId: a,
          groupId: c.groupId,
          type: 'payment',
          amountPiastres: -pounds * 100,
          method: 'cash',
          receiptNo: ++receiptNo,
          createdAt: new Date(at),
        });
    await pay(100, '2026-11-21T10:00:00Z');
    await pay(70, '2026-10-31T21:30:00Z'); // 23:30 on Oct 31 in Cairo
    await pay(40, '2026-06-30T20:00:00Z'); // June: before the 6 months

    const res = await c.owner('GET', 'stats/trends');
    expect(res.statusCode).toBe(200);
    const body = res.json();
    expect(body.weeks).toHaveLength(8);
    expect(body.weeks.at(0)).toBe('2026-10-03');
    expect(body.weeks.at(-1)).toBe('2026-11-21'); // a Saturday starts its own week
    expect(body.groups).toHaveLength(1);
    expect(body.groups[0].attendance.at(-1)).toEqual({ present: 1, total: 2 });
    expect(body.groups[0].attendance.at(0)).toEqual({ present: 0, total: 0 });
    expect(body.groups[0].exams).toEqual([
      { id: exam, title: 'شهر', heldOn: '2026-11-21', averagePct: 75 },
    ]);
    expect(body.money.map((m: { month: string }) => m.month)).toEqual([
      '2026-06',
      '2026-07',
      '2026-08',
      '2026-09',
      '2026-10',
      '2026-11',
    ]);
    expect(body.money.at(-1)).toEqual({
      month: '2026-11',
      cash: 10000,
      vodafone_cash: 0,
      instapay: 0,
      total: 10000,
    });
    expect(body.money.at(-2).total).toBe(7000);
    expect(body.money.at(0).total).toBe(4000);

    // A term (13 weeks) reaches the September exam; money stays at 6 months.
    const term = (await c.owner('GET', 'stats/trends?weeks=13')).json();
    expect([term.weeks.length, term.weeks.at(0), term.weeks.at(-1)]).toEqual([
      13,
      '2026-08-29',
      '2026-11-21',
    ]);
    expect(term.groups[0].attendance).toHaveLength(13);
    expect(term.groups[0].exams.map((e: { title: string }) => e.title)).toEqual(['قديم', 'شهر']);
    expect(term.money).toHaveLength(6);
    expect((await c.owner('GET', 'stats/trends?weeks=26')).json().weeks).toHaveLength(26);
    const bad = await c.owner('GET', 'stats/trends?weeks=10');
    expect([bad.statusCode, bad.json().code]).toEqual([400, 'VALIDATION_FAILED']);

    // Teachers see their groups but no money; an unscoped assistant sees no groups and zeros.
    const teacher = (await c.teacher('GET', 'stats/trends')).json();
    expect([teacher.groups.length, teacher.money]).toEqual([1, null]);
    const assistant = (await c.assistant('GET', 'stats/trends')).json();
    expect(assistant.groups).toEqual([]);
    expect(assistant.money.every((m: { total: number }) => m.total === 0)).toBe(true);
    const other = (await (await f.center()).owner('GET', 'stats/trends')).json();
    expect(other.groups).toHaveLength(1); // its own fixture group, with no records
    expect(other.groups[0].id).not.toBe(c.groupId);
    expect(other.groups[0].exams).toEqual([]);
  });
});

describe('GET /stats/cash-summary', () => {
  it("gives each recorder's payments minus reversals by method for a Cairo day, by role", async () => {
    const c = await f.center();
    const studentId = await c.newStudent();
    const id = async (call: typeof c.owner) => (await call('GET', 'me')).json().id as string;
    const [ownerId, teacherId, assistantId] = [
      await id(c.owner),
      await id(c.teacher),
      await id(c.assistant),
    ];
    const base = { workspaceId: c.workspaceId, studentId, groupId: c.groupId };
    let receiptNo = 0;
    const pay = async (
      by: string,
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
          createdBy: by,
          createdAt: new Date(at),
        })
        .returning();
      return row!;
    };
    const reverse = (e: typeof ledgerEntries.$inferSelect, by: string, at: string) =>
      testDb()
        .db.insert(ledgerEntries)
        .values({
          ...base,
          type: 'reversal',
          amountPiastres: -e.amountPiastres,
          reversesEntryId: e.id,
          createdBy: by,
          createdAt: new Date(at),
        });

    await pay(assistantId, 100, 'cash', '2026-11-21T08:00:00Z');
    await pay(assistantId, 50, 'vodafone_cash', '2026-11-20T23:30:00Z'); // 01:30 on the 21st
    const old = await pay(assistantId, 30, 'instapay', '2026-11-20T21:30:00Z'); // 23:30 on the 20th
    const mistake = await pay(assistantId, 40, 'cash', '2026-11-21T09:00:00Z');
    await reverse(mistake, ownerId, '2026-11-21T09:05:00Z'); // the owner voids it: off the assistant
    await reverse(old, assistantId, '2026-11-21T10:00:00Z'); // refunded today
    await pay(assistantId, 20, 'cash', '2026-11-21T14:00:00Z'); // after "now"
    await pay(teacherId, 60, 'cash', '2026-11-21T11:00:00Z');
    const [charge] = await testDb()
      .db.insert(ledgerEntries)
      .values({
        ...base,
        type: 'charge',
        amountPiastres: 40000,
        period: '2026-11',
        createdBy: ownerId,
      })
      .returning();
    await reverse(charge!, ownerId, '2026-11-21T09:00:00Z'); // not money

    const res = await c.assistant('GET', 'stats/cash-summary');
    expect(res.statusCode).toBe(200);
    const mine = res.json();
    expect(mine).toMatchObject({
      date: '2026-11-21',
      timezone: 'Africa/Cairo',
      center: { nameAr: 'سنتر', nameEn: null },
    });
    expect(mine.staff).toHaveLength(1);
    expect(mine.staff[0]).toMatchObject({
      userId: assistantId,
      totals: { cash: 10000, vodafone_cash: 5000, instapay: -3000, total: 12000 },
    });
    expect(
      mine.staff[0].entries.map((e: Record<string, unknown>) => [
        e.kind,
        e.receiptNo,
        e.amountPiastres,
        e.method,
      ]),
    ).toEqual([
      ['payment', 2, 5000, 'vodafone_cash'],
      ['payment', 1, 10000, 'cash'],
      ['payment', 4, 4000, 'cash'],
      ['reversal', 4, -4000, 'cash'],
      ['reversal', 3, -3000, 'instapay'],
    ]);
    expect(mine.staff[0].entries[0]).toMatchObject({
      studentName: expect.stringMatching(/^طالب/),
      createdAt: '2026-11-20T23:30:00.000Z',
    });

    // The teacher sees only what they took.
    const teacher = (await c.teacher('GET', 'stats/cash-summary')).json();
    expect(teacher.staff).toHaveLength(1);
    expect(teacher.staff[0]).toMatchObject({
      userId: teacherId,
      totals: { cash: 6000, total: 6000 },
    });

    // The owner sees everyone; their own section comes first, even when empty.
    const owner = (await c.owner('GET', 'stats/cash-summary')).json();
    expect(owner.staff.map((s: { userId: string }) => s.userId)).toEqual([
      ownerId,
      ...[assistantId, teacherId].sort((a, b) =>
        owner.staff
          .find((s: { userId: string }) => s.userId === a)
          .name.localeCompare(
            owner.staff.find((s: { userId: string }) => s.userId === b).name,
            'ar',
          ),
      ),
    ]);
    expect(owner.staff[0]).toMatchObject({ totals: { total: 0 }, entries: [] });

    // A chosen past day.
    const yesterday = (await c.assistant('GET', 'stats/cash-summary?date=2026-11-20')).json();
    expect(yesterday.date).toBe('2026-11-20');
    expect(yesterday.staff[0].totals).toEqual({
      cash: 0,
      vodafone_cash: 0,
      instapay: 3000,
      total: 3000,
    });

    // A future or malformed day is rejected.
    for (const q of ['2026-11-22', 'tomorrow']) {
      const bad = await c.owner('GET', `stats/cash-summary?date=${q}`);
      expect([bad.statusCode, bad.json().code]).toEqual([400, 'VALIDATION_FAILED']);
    }

    // Another center's owner sees none of it.
    const other = (await (await f.center()).owner('GET', 'stats/cash-summary')).json();
    expect(other.staff).toHaveLength(1);
    expect(other.staff[0].entries).toEqual([]);
  });
});
