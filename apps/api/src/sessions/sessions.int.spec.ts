import type { NestFastifyApplication } from '@nestjs/platform-fastify';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { assistantScopes, withTenant } from '@dafter/db';
import { makeMembership, useTestDb } from '@dafter/db/testing';
import { createApp } from '../app.js';
import { FakeClock } from '../clock.js';
import { generateAllSessions } from '../jobs/generate-sessions.js';
import { generateSessions } from './generate.js';

const testDb = useTestDb();
// Monday 2026-11-16, 10:00 in Cairo (UTC+2 in winter).
const clock = new FakeClock(new Date('2026-11-16T08:00:00Z'));
let app: NestFastifyApplication;

beforeAll(async () => {
  app = await createApp({ logger: false, db: testDb().db, clock });
  await app.init();
  await app.getHttpAdapter().getInstance().ready();
});
afterAll(() => app.close());

type Method = 'GET' | 'POST' | 'PATCH';
let n = 0;

async function register() {
  const phone = `0171000${String(++n).padStart(4, '0')}`;
  const res = await app.inject({
    method: 'POST',
    url: '/api/v1/auth/register',
    payload: { name: `مدرس ${n}`, phone, password: 'correct horse' },
  });
  return { token: res.json().accessToken as string, userId: res.json().user.id as string };
}

/** A center with an owner, two teachers, an assistant for teacher 1, and one group of teacher 1. */
async function center() {
  const owner = await register();
  const ws = (
    await app.inject({
      method: 'POST',
      url: '/api/v1/workspaces',
      headers: { authorization: `Bearer ${owner.token}` },
      payload: { type: 'center', nameAr: 'سنتر' },
    })
  ).json().id as string;
  const as = (token: string) => (method: Method, url: string, payload?: object) =>
    app.inject({
      method,
      url: `/api/v1/${url}`,
      payload,
      headers: { authorization: `Bearer ${token}`, 'x-workspace-id': ws },
    });
  const member = async (role: 'teacher' | 'assistant') => {
    const u = await register();
    const m = await makeMembership(testDb().db, { workspaceId: ws, userId: u.userId, role });
    return { id: m.id, call: as(u.token) };
  };
  const t1 = await member('teacher');
  const t2 = await member('teacher');
  const assistant = await member('assistant');
  await testDb()
    .db.insert(assistantScopes)
    .values({ workspaceId: ws, membershipId: assistant.id, teacherMembershipId: t1.id });
  const subjects = (await as(owner.token)('GET', 'subjects')).json();
  const grades = (await as(owner.token)('GET', 'grade-levels')).json();
  const group = (
    await t1.call('POST', 'groups', {
      subjectId: subjects[0].id,
      gradeLevelId: grades[0].id,
      slots: [{ weekday: 6, startTime: '16:00', endTime: '17:30' }],
    })
  ).json();
  return { ws, owner: as(owner.token), t1, t2, assistant, group };
}

const WEEKS = 'sessions?from=2026-11-16&to=2026-12-16';
const list = async (call: (m: Method, u: string) => ReturnType<typeof app.inject>, url = WEEKS) =>
  (await call('GET', url)).json() as unknown as {
    id: string;
    startsAt: string;
    status: string;
    moved: boolean;
  }[];

let c: Awaited<ReturnType<typeof center>>;
beforeAll(async () => {
  c = await center();
});

describe('generation', () => {
  it('creates 4 weeks of sessions when a group is created, in UTC from Cairo time', async () => {
    const sessions = await list(c.t1.call);
    // Saturdays Nov 21 to Dec 12; 16:00 Cairo = 14:00 UTC in winter.
    expect(sessions.map((s) => s.startsAt)).toEqual([
      '2026-11-21T14:00:00.000Z',
      '2026-11-28T14:00:00.000Z',
      '2026-12-05T14:00:00.000Z',
      '2026-12-12T14:00:00.000Z',
    ]);
    expect(sessions[0]).toMatchObject({ status: 'scheduled', moved: false, groupId: c.group.id });
  });

  it('is idempotent, and the daily job only tops up the new day', async () => {
    expect(await generateAllSessions(testDb().db, clock)).toBe(0);
    clock.advance(7 * 86_400_000);
    try {
      // Every workspace's groups top up by one week; this group gains Dec 19.
      expect(await generateAllSessions(testDb().db, clock)).toBeGreaterThanOrEqual(1);
      expect(await generateAllSessions(testDb().db, clock)).toBe(0);
    } finally {
      // Back to Monday so the access tokens (15 minutes, on this clock) are valid again.
      clock.advance(-7 * 86_400_000);
    }
    const sessions = await list(c.t1.call, 'sessions?from=2026-11-20&to=2026-12-20');
    expect(sessions.map((s) => s.startsAt)).toHaveLength(5);
    expect(sessions.at(-1)!.startsAt).toBe('2026-12-19T14:00:00.000Z');
  });

  it('follows Cairo DST: the same 16:00 slot is 14:00 UTC before the switch, 13:00 after', async () => {
    const other = await center();
    // Egypt moves to UTC+3 on the last Friday of April (2027-04-30).
    await withTenant(testDb().db, other.ws, (tx) =>
      generateSessions(tx, other.ws, new Date('2027-04-20T08:00:00Z'), other.group.id),
    );
    const sessions = await list(other.t1.call, 'sessions?from=2027-04-20&to=2027-05-10');
    expect(sessions.map((s) => s.startsAt)).toEqual([
      '2027-04-24T14:00:00.000Z',
      '2027-05-01T13:00:00.000Z',
      '2027-05-08T13:00:00.000Z',
    ]);
  });
});

describe('GET /sessions', () => {
  it('uses the group view: assistant sees the assigned teacher, another teacher sees nothing', async () => {
    expect(await list(c.assistant.call)).toHaveLength(4);
    expect(await list(c.owner)).toHaveLength(4);
    expect(await list(c.t2.call)).toEqual([]);
  });

  it('filters by local date, inclusive', async () => {
    expect(await list(c.t1.call, 'sessions?from=2026-11-21&to=2026-11-21')).toHaveLength(1);
    expect(await list(c.t1.call, 'sessions?from=2026-11-22&to=2026-11-27')).toHaveLength(0);
  });

  it('rejects a range longer than 31 days', async () => {
    const res = await c.t1.call('GET', 'sessions?from=2026-11-01&to=2027-01-01');
    expect(res.json().code).toBe('VALIDATION_FAILED');
  });
});

describe('cancel and move', () => {
  let ids: string[];
  beforeAll(async () => {
    ids = (await list(c.t1.call)).map((s) => s.id);
  });

  it('lets the teacher cancel a scheduled session, once', async () => {
    const res = await c.t1.call('POST', `sessions/${ids[0]}/cancel`);
    expect(res.statusCode).toBe(200);
    expect(res.json().status).toBe('cancelled');
    expect((await c.t1.call('POST', `sessions/${ids[0]}/cancel`)).json().code).toBe(
      'SESSION_NOT_SCHEDULED',
    );
  });

  it('forbids the assistant and hides the session from other teachers and workspaces', async () => {
    expect((await c.assistant.call('POST', `sessions/${ids[1]}/cancel`)).json().code).toBe(
      'FORBIDDEN',
    );
    expect((await c.t2.call('POST', `sessions/${ids[1]}/cancel`)).json().code).toBe(
      'SESSION_NOT_FOUND',
    );
    const other = await center();
    const move = { date: '2026-11-30', startTime: '10:00', endTime: '11:00' };
    expect((await other.owner('PATCH', `sessions/${ids[1]}`, move)).json().code).toBe(
      'SESSION_NOT_FOUND',
    );
  });

  it('moves a session in Cairo time and marks it moved', async () => {
    const res = await c.owner('PATCH', `sessions/${ids[1]}`, {
      date: '2026-11-30',
      startTime: '10:00',
      endTime: '11:30',
    });
    expect(res.statusCode).toBe(200);
    expect(res.json()).toMatchObject({
      startsAt: '2026-11-30T08:00:00.000Z',
      endsAt: '2026-11-30T09:30:00.000Z',
      moved: true,
    });
  });

  it('refuses TEACHER_BOOKED onto another session of the same teacher, and rolls it back', async () => {
    const f = await center();
    const subjects = (await f.owner('GET', 'subjects')).json();
    const grades = (await f.owner('GET', 'grade-levels')).json();
    const group = async (call: typeof f.owner, weekday: number) =>
      (
        await call('POST', 'groups', {
          subjectId: subjects[0].id,
          gradeLevelId: grades[0].id,
          slots: [{ weekday, startTime: '10:00', endTime: '11:00' }],
        })
      ).json().id as string;
    const sunday = await group(f.t1.call, 0);
    await group(f.t2.call, 1);
    const sessions = (await list(f.owner, 'sessions?from=2026-11-21&to=2026-11-29')) as unknown as {
      id: string;
      groupId: string;
      startsAt: string;
    }[];
    const sun = sessions.find((s) => s.groupId === sunday)!;
    const sat = sessions.find((s) => s.groupId === f.group.id)!;

    // Onto Saturday Nov 21, 16:00-17:30 (the other group of teacher 1).
    const clash = await f.owner('PATCH', `sessions/${sun.id}`, {
      date: '2026-11-21',
      startTime: '17:00',
      endTime: '18:00',
    });
    expect([clash.statusCode, clash.json()]).toEqual([
      409,
      {
        code: 'TEACHER_BOOKED',
        details: { date: '2026-11-21', startTime: '16:00', endTime: '17:30' },
      },
    ]);
    const after = await f.owner('GET', 'sessions?from=2026-11-22&to=2026-11-22');
    expect(after.json().map((s: { startsAt: string }) => s.startsAt)).toEqual([sun.startsAt]);

    // Touching is fine; another teacher's session at the same time is fine.
    const touch = { date: '2026-11-21', startTime: '17:30', endTime: '18:30' };
    expect((await f.owner('PATCH', `sessions/${sun.id}`, touch)).statusCode).toBe(200);
    const monday = { date: '2026-11-23', startTime: '10:00', endTime: '11:00' };
    expect((await f.owner('PATCH', `sessions/${sun.id}`, monday)).statusCode).toBe(200);
    // A cancelled session doesn't block; a session doesn't clash with itself.
    await f.owner('POST', `sessions/${sat.id}/cancel`);
    const onto = { date: '2026-11-21', startTime: '16:00', endTime: '17:00' };
    expect((await f.owner('PATCH', `sessions/${sun.id}`, onto)).statusCode).toBe(200);
    const shorter = { date: '2026-11-21', startTime: '16:00', endTime: '16:30' };
    expect((await f.owner('PATCH', `sessions/${sun.id}`, shorter)).statusCode).toBe(200);
  });

  it('rejects a move into the past or with the end before the start', async () => {
    const past = { date: '2026-11-16', startTime: '09:00', endTime: '09:30' };
    expect((await c.t1.call('PATCH', `sessions/${ids[2]}`, past)).json().code).toBe(
      'SESSION_TIME_INVALID',
    );
    const backwards = { date: '2026-11-30', startTime: '12:00', endTime: '11:00' };
    expect((await c.t1.call('PATCH', `sessions/${ids[2]}`, backwards)).json().code).toBe(
      'VALIDATION_FAILED',
    );
  });

  it('keeps cancelled and moved sessions when the slots are replaced', async () => {
    await c.t1.call('PATCH', `groups/${c.group.id}`, {
      slots: [{ weekday: 0, startTime: '10:00', endTime: '11:00' }],
    });
    const sessions = await list(c.t1.call, 'sessions?from=2026-11-16&to=2026-12-13');
    expect(sessions.map((s) => [s.startsAt, s.status, s.moved])).toEqual([
      ['2026-11-21T14:00:00.000Z', 'cancelled', false],
      // Sundays 10:00 Cairo, plus the session moved to Monday Nov 30.
      ['2026-11-22T08:00:00.000Z', 'scheduled', false],
      ['2026-11-29T08:00:00.000Z', 'scheduled', false],
      ['2026-11-30T08:00:00.000Z', 'scheduled', true],
      ['2026-12-06T08:00:00.000Z', 'scheduled', false],
      ['2026-12-13T08:00:00.000Z', 'scheduled', false],
    ]);
  });

  it('drops untouched future sessions when the group is archived', async () => {
    await c.t1.call('PATCH', `groups/${c.group.id}`, { status: 'archived' });
    const sessions = await list(c.t1.call, 'sessions?from=2026-11-16&to=2026-12-13');
    expect(sessions.map((s) => s.status)).toEqual(['cancelled', 'scheduled']);
    expect(await generateAllSessions(testDb().db, clock)).toBeGreaterThanOrEqual(0);
    expect(await list(c.t1.call, 'sessions?from=2026-11-16&to=2026-12-13')).toHaveLength(2);
  });
});
