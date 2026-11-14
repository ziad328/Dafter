import type { NestFastifyApplication } from '@nestjs/platform-fastify';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
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
