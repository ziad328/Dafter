import type { NestFastifyApplication } from '@nestjs/platform-fastify';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { assistantScopes } from '@dafter/db';
import { makeMembership, useTestDb } from '@dafter/db/testing';
import { createApp } from '../app.js';

const testDb = useTestDb();
let app: NestFastifyApplication;

beforeAll(async () => {
  app = await createApp({ logger: false, db: testDb().db });
  await app.init();
  await app.getHttpAdapter().getInstance().ready();
});
afterAll(() => app.close());

type Method = 'GET' | 'POST' | 'PATCH' | 'DELETE';
let n = 0;

async function register() {
  const phone = `0170000${String(++n).padStart(4, '0')}`;
  const res = await app.inject({
    method: 'POST',
    url: '/api/v1/auth/register',
    payload: { name: `مدرس ${n}`, phone, password: 'correct horse' },
  });
  return { token: res.json().accessToken as string, userId: res.json().user.id as string };
}

/** A center with an owner, two teachers and an assistant who works for teacher 1 only. */
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
  return { ws, owner: as(owner.token), t1, t2, assistant, subjects, grades };
}

let c: Awaited<ReturnType<typeof center>>;
beforeAll(async () => {
  c = await center();
});

const body = (extra: object = {}) => ({
  subjectId: c.subjects[5].id,
  gradeLevelId: c.grades[11].id,
  capacity: 40,
  slots: [
    { weekday: 6, startTime: '16:00', endTime: '17:30' },
    { weekday: 2, startTime: '18:00', endTime: '19:30' },
  ],
  ...extra,
});

describe('curriculum', () => {
  it('copies the Egyptian curriculum into every new workspace, in order', () => {
    expect(c.subjects).toHaveLength(16);
    expect(c.subjects[5]).toMatchObject({ nameAr: 'الفيزياء', nameEn: 'Physics' });
    expect(c.grades).toHaveLength(12);
    expect(c.grades[11]).toMatchObject({ nameAr: 'الصف الثالث الثانوي', nameEn: 'Secondary 3' });
  });
});

describe('POST /groups', () => {
  it('lets the owner create a group for a teacher', async () => {
    const res = await c.owner('POST', 'groups', body({ teacherMembershipId: c.t1.id }));
    expect(res.statusCode).toBe(201);
    expect(res.json()).toMatchObject({
      teacherMembershipId: c.t1.id,
      teacherName: expect.any(String),
      subject: { nameEn: 'Physics' },
      gradeLevel: { nameEn: 'Secondary 3' },
      capacity: 40,
      status: 'active',
      // Sorted by weekday, "HH:MM".
      slots: [
        { weekday: 2, startTime: '18:00', endTime: '19:30' },
        { weekday: 6, startTime: '16:00', endTime: '17:30' },
      ],
    });
  });

  it("makes a teacher's group their own and forbids creating one for someone else", async () => {
    const own = await c.t2.call('POST', 'groups', body());
    expect(own.json().teacherMembershipId).toBe(c.t2.id);
    const other = await c.t2.call('POST', 'groups', body({ teacherMembershipId: c.t1.id }));
    expect(other.json().code).toBe('FORBIDDEN');
  });

  it('forbids assistants', async () => {
    expect((await c.assistant.call('POST', 'groups', body())).json().code).toBe('FORBIDDEN');
  });

  it('rejects references from another workspace or an assistant as teacher', async () => {
    const other = await center();
    const foreign = await c.owner('POST', 'groups', body({ subjectId: other.subjects[0].id }));
    expect(foreign.json()).toEqual({
      code: 'GROUP_REFERENCE_INVALID',
      details: { field: 'subjectId' },
    });
    const grade = await c.owner('POST', 'groups', body({ gradeLevelId: other.grades[0].id }));
    expect(grade.json().details).toEqual({ field: 'gradeLevelId' });
    const asst = await c.owner('POST', 'groups', body({ teacherMembershipId: c.assistant.id }));
    expect(asst.json().details).toEqual({ field: 'teacherMembershipId' });
  });

  it('rejects overlapping slots and a slot that ends before it starts', async () => {
    const overlap = await c.owner(
      'POST',
      'groups',
      body({
        slots: [
          { weekday: 6, startTime: '16:00', endTime: '17:30' },
          { weekday: 6, startTime: '17:00', endTime: '18:00' },
        ],
      }),
    );
    expect(overlap.json().code).toBe('VALIDATION_FAILED');
    const backwards = await c.owner(
      'POST',
      'groups',
      body({ slots: [{ weekday: 1, startTime: '18:00', endTime: '17:00' }] }),
    );
    expect(backwards.json().code).toBe('VALIDATION_FAILED');
  });
});

describe('reading groups', () => {
  it('shows the owner everything, a teacher their own, an assistant their teachers', async () => {
    const g1 = (await c.owner('POST', 'groups', body({ teacherMembershipId: c.t1.id }))).json();
    const g2 = (await c.owner('POST', 'groups', body({ teacherMembershipId: c.t2.id }))).json();
    const ids = async (call: typeof c.owner) =>
      ((await call('GET', 'groups')).json() as { id: string }[]).map((g) => g.id);

    expect(await ids(c.owner)).toEqual(expect.arrayContaining([g1.id, g2.id]));
    expect(await ids(c.t1.call)).toContain(g1.id);
    expect(await ids(c.t1.call)).not.toContain(g2.id);
    expect(await ids(c.assistant.call)).toContain(g1.id);
    expect(await ids(c.assistant.call)).not.toContain(g2.id);

    expect((await c.assistant.call('GET', `groups/${g1.id}`)).statusCode).toBe(200);
    // Out of scope looks the same as missing.
    expect((await c.assistant.call('GET', `groups/${g2.id}`)).json().code).toBe('GROUP_NOT_FOUND');
    expect((await c.t1.call('GET', `groups/${g2.id}`)).json().code).toBe('GROUP_NOT_FOUND');
  });

  it("returns GROUP_NOT_FOUND for another workspace's group, with that workspace's own header", async () => {
    const g = (await c.owner('POST', 'groups', body({ teacherMembershipId: c.t1.id }))).json();
    const other = await center();
    expect((await other.owner('GET', `groups/${g.id}`)).json().code).toBe('GROUP_NOT_FOUND');
    const patch = await other.owner('PATCH', `groups/${g.id}`, { capacity: 1 });
    expect(patch.json().code).toBe('GROUP_NOT_FOUND');
    expect(((await other.owner('GET', 'groups')).json() as unknown[]).length).toBe(0);
  });
});

describe('PATCH /groups/:id', () => {
  it('replaces the slots and updates fields in one call', async () => {
    const g = (await c.t1.call('POST', 'groups', body())).json();
    const res = await c.t1.call('PATCH', `groups/${g.id}`, {
      capacity: null,
      status: 'archived',
      slots: [{ weekday: 0, startTime: '10:00', endTime: '11:00' }],
    });
    expect(res.statusCode).toBe(200);
    expect(res.json()).toMatchObject({
      capacity: null,
      status: 'archived',
      slots: [{ weekday: 0, startTime: '10:00', endTime: '11:00' }],
    });
  });

  it('sets, trims and clears the optional label, and shows it on the sessions', async () => {
    const g = (await c.t1.call('POST', 'groups', body({ label: '  مجموعة أ ' }))).json();
    expect(g.label).toBe('مجموعة أ');
    const day = (d: number) => new Date(Date.now() + d * 86_400_000).toISOString().slice(0, 10);
    const sessions = (await c.t1.call('GET', `sessions?from=${day(0)}&to=${day(14)}`)).json() as {
      groupId: string;
      groupLabel: string | null;
    }[];
    expect(sessions.find((s) => s.groupId === g.id)?.groupLabel).toBe('مجموعة أ');
    expect((await c.t1.call('PATCH', `groups/${g.id}`, { label: 'x'.repeat(41) })).statusCode).toBe(
      400,
    );
    expect((await c.t1.call('PATCH', `groups/${g.id}`, { label: ' ' })).statusCode).toBe(400);
    const cleared = await c.t1.call('PATCH', `groups/${g.id}`, { label: null });
    expect(cleared.json().label).toBeNull();
    expect((await c.t1.call('POST', 'groups', body())).json().label).toBeNull();
  });

  it('lets only the owner reassign the teacher, and never an assistant edit', async () => {
    const g = (await c.t1.call('POST', 'groups', body())).json();
    const byTeacher = await c.t1.call('PATCH', `groups/${g.id}`, { teacherMembershipId: c.t2.id });
    expect(byTeacher.json().code).toBe('FORBIDDEN');
    const byAssistant = await c.assistant.call('PATCH', `groups/${g.id}`, { capacity: 5 });
    expect(byAssistant.json().code).toBe('FORBIDDEN');
    const byOwner = await c.owner('PATCH', `groups/${g.id}`, { teacherMembershipId: c.t2.id });
    expect(byOwner.json().teacherMembershipId).toBe(c.t2.id);
  });
});

describe('student count', () => {
  it('counts active enrollments only', async () => {
    const id = (
      await c.owner(
        'POST',
        'groups',
        body({ slots: [{ weekday: 5, startTime: '08:00', endTime: '09:00' }] }),
      )
    ).json().id as string;
    const student = async (k: number) =>
      (
        await c.owner('POST', 'students', {
          nameAr: `طالب ${k}`,
          gradeLevelId: c.grades[11].id,
          guardian: {
            phone: `0120000${String(k).padStart(4, '0')}`,
            relation: 'father',
            preferredLocale: 'ar',
            whatsappOptIn: false,
          },
        })
      ).json().id as string;
    const [a, b] = [await student(1), await student(2)];
    const joined = await c.owner('POST', `students/${a}/enrollments`, { groupId: id });
    expect(joined.json()).toMatchObject({ status: 'active' });
    const left = (await c.owner('POST', `students/${b}/enrollments`, { groupId: id })).json().id;
    await c.owner('DELETE', `students/${b}/enrollments/${left}`);
    expect((await c.owner('GET', `groups/${id}`)).json().studentCount).toBe(1);
    expect(
      (
        await c.owner(
          'POST',
          'groups',
          body({ slots: [{ weekday: 4, startTime: '08:00', endTime: '09:00' }] }),
        )
      ).json().studentCount,
    ).toBe(0);
  });
});
