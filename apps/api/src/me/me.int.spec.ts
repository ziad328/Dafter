import type { NestFastifyApplication } from '@nestjs/platform-fastify';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { useTestDb } from '@dafter/db/testing';
import { createApp } from '../app.js';
import { FakeClock } from '../clock.js';
import { ConsoleMailer } from '../student-auth/mailer.js';
import { fixtures } from '../testing/fixtures.js';

const testDb = useTestDb();
// Saturday 15:30 Cairo; the fixture groups meet Saturdays 16:00-17:30 Cairo (open from 15:30).
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
  await app.getHttpAdapter().getInstance().ready();
});
afterAll(() => app.close());

const get = async (token: string, url: string) =>
  (await app.inject({ method: 'GET', url: `/api/v1/${url}`, headers: f.bearer(token) })).json();

describe('the student app reads', () => {
  it("shows my sessions and attendance in both my centers, and nobody else's", async () => {
    const a = await f.center();
    const b = await f.center();
    const email = 'two@example.com';
    const inA = await a.newStudent();
    const inB = await b.newStudent();
    await a.owner('POST', `students/${inA}/enrollments`, { groupId: a.groupId });
    await b.owner('POST', `students/${inB}/enrollments`, { groupId: b.groupId });
    const me = await f.activate(a.owner, inA, email);
    await f.activate(b.owner, inB, email);

    // Another student in A, enrolled in the same group, with their own record.
    const other = await a.newStudent();
    await a.owner('POST', `students/${other}/enrollments`, { groupId: a.groupId });
    const otherLogin = await f.activate(a.owner, other, 'other@example.com');

    // Saturdays 21 and 28 Nov in each center; 5 Dec is past the 14-day window.
    const schedule = await get(me.token, 'me/schedule');
    expect(schedule.map((s: { startsAt: string }) => s.startsAt)).toEqual([
      '2026-11-21T14:00:00.000Z',
      '2026-11-21T14:00:00.000Z',
      '2026-11-28T14:00:00.000Z',
      '2026-11-28T14:00:00.000Z',
    ]);
    expect(schedule[0]).toMatchObject({
      center: { nameAr: 'سنتر' },
      groupLabel: null,
      timezone: 'Africa/Cairo',
    });

    const [today] = (await a.owner('GET', 'sessions?from=2026-11-21&to=2026-11-21')).json();
    await a.owner('POST', `sessions/${today.id}/open`);
    await a.owner('PUT', `sessions/${today.id}/attendance/${inA}`, { status: 'late' });
    await a.owner('PUT', `sessions/${today.id}/attendance/${other}`, { status: 'absent' });

    expect(await get(me.token, 'me/attendance')).toMatchObject([
      { sessionId: today.id, status: 'late', startsAt: '2026-11-21T14:00:00.000Z' },
    ]);
    expect(await get(otherLogin.token, 'me/attendance')).toMatchObject([{ status: 'absent' }]);
  });

  it('drops groups I left, and gives staff logins nothing', async () => {
    const c = await f.center();
    const id = await c.newStudent();
    const enrolled = (
      await c.owner('POST', `students/${id}/enrollments`, { groupId: c.groupId })
    ).json();
    const s = await f.activate(c.owner, id, 'left@example.com');
    expect(await get(s.token, 'me/schedule')).toHaveLength(2);
    await c.owner('DELETE', `students/${id}/enrollments/${enrolled.id}`);
    expect(await get(s.token, 'me/schedule')).toEqual([]);

    const staff = await f.register();
    expect(await get(staff.token, 'me/schedule')).toEqual([]);
    expect(await get(staff.token, 'me/attendance')).toEqual([]);
  });
});
