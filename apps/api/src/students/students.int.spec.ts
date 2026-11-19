import type { NestFastifyApplication } from '@nestjs/platform-fastify';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { makeMembership, useTestDb } from '@dafter/db/testing';
import { createApp } from '../app.js';
import { FakeClock } from '../clock.js';

const testDb = useTestDb();
let app: NestFastifyApplication;

beforeAll(async () => {
  app = await createApp({
    logger: false,
    db: testDb().db,
    clock: new FakeClock(new Date('2026-11-16T08:00:00Z')),
  });
  await app.init();
  await app.getHttpAdapter().getInstance().ready();
});
afterAll(() => app.close());

type Method = 'GET' | 'POST' | 'PATCH';
type Call = (method: Method, url: string, payload?: object) => ReturnType<typeof app.inject>;
let n = 0;

async function register() {
  const phone = `0172000${String(++n).padStart(4, '0')}`;
  const res = await app.inject({
    method: 'POST',
    url: '/api/v1/auth/register',
    payload: { name: `مدرس ${n}`, phone, password: 'correct horse' },
  });
  return { token: res.json().accessToken as string, userId: res.json().user.id as string };
}

/** A center with an owner, a teacher and an assistant. */
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
  const as =
    (token: string): Call =>
    (method, url, payload) =>
      app.inject({
        method,
        url: `/api/v1/${url}`,
        payload,
        headers: { authorization: `Bearer ${token}`, 'x-workspace-id': ws },
      });
  const member = async (role: 'teacher' | 'assistant') => {
    const u = await register();
    await makeMembership(testDb().db, { workspaceId: ws, userId: u.userId, role });
    return as(u.token);
  };
  const ownerCall = as(owner.token);
  const grades = (await ownerCall('GET', 'grade-levels')).json();
  return {
    owner: ownerCall,
    teacher: await member('teacher'),
    assistant: await member('assistant'),
    gradeId: grades[0].id as string,
  };
}

const guardian = (phone: string, extra: object = {}) => ({
  phone,
  relation: 'mother',
  preferredLocale: 'ar',
  whatsappOptIn: true,
  ...extra,
});

let c: Awaited<ReturnType<typeof center>>;
beforeAll(async () => {
  c = await center();
});

const names = async (call: Call, q: string) =>
  ((await call('GET', `students?q=${encodeURIComponent(q)}`)).json() as { nameAr: string }[]).map(
    (s) => s.nameAr,
  );

describe('students', () => {
  it('creates a student with a primary guardian (assistant at the door)', async () => {
    const res = await c.assistant('POST', 'students', {
      nameAr: 'أحمد سمير',
      phone: '01011111111',
      gradeLevelId: c.gradeId,
      guardian: guardian('01211111111', { name: 'منى' }),
    });
    expect(res.statusCode).toBe(201);
    expect(res.json()).toMatchObject({
      nameAr: 'أحمد سمير',
      nameEn: null,
      status: 'active',
      gradeLevel: { id: c.gradeId },
      guardians: [{ phone: '01211111111', name: 'منى', relation: 'mother', isPrimary: true }],
    });
  });

  it('reuses the guardian for a sibling with the same parent phone', async () => {
    const first = (
      await c.teacher('POST', 'students', {
        nameAr: 'فاطمة علي',
        gradeLevelId: c.gradeId,
        guardian: guardian('01222222222', { name: 'علي' }),
      })
    ).json();
    // No name sent: the stored name stays.
    const sibling = (
      await c.owner('POST', 'students', {
        nameAr: 'يوسف علي',
        gradeLevelId: c.gradeId,
        guardian: guardian('01222222222', { relation: 'father' }),
      })
    ).json();
    expect(sibling.guardians[0].id).toBe(first.guardians[0].id);
    expect(sibling.guardians[0]).toMatchObject({ name: 'علي', relation: 'father' });
  });

  it('finds names regardless of hamza, taa marbuta and diacritics', async () => {
    expect(await names(c.owner, 'احمد')).toContain('أحمد سمير');
    expect(await names(c.owner, 'فاطمه')).toContain('فاطمة علي');
    expect(await names(c.owner, 'أَحْمَد')).toContain('أحمد سمير');
    expect(await names(c.owner, 'سمير')).toEqual(['أحمد سمير']);
    // Trigram similarity catches a typo.
    expect(await names(c.owner, 'فاطما')).toContain('فاطمة علي');
  });

  it('finds students by the start of their own or a parent phone (duplicate warning)', async () => {
    expect(await names(c.owner, '01011111111')).toEqual(['أحمد سمير']);
    expect(await names(c.owner, '012222')).toEqual(['فاطمة علي', 'يوسف علي']);
    expect(await names(c.owner, '٠١٠١١١١١١١١')).toEqual(['أحمد سمير']);
    expect(await names(c.owner, '01099999999')).toEqual([]);
  });

  it('treats LIKE wildcards in the query as text', async () => {
    expect(await names(c.owner, '%')).toEqual([]);
  });

  it('updates fields, the search name, the primary guardian and archives', async () => {
    const s = (
      await c.owner('POST', 'students', {
        nameAr: 'كريم',
        gradeLevelId: c.gradeId,
        guardian: guardian('01233333333'),
      })
    ).json();
    const res = await c.teacher('PATCH', `students/${s.id}`, {
      nameEn: 'Kareem Adel',
      school: 'مدرسة النصر',
      guardian: guardian('01244444444'),
      status: 'archived',
    });
    expect(res.statusCode).toBe(200);
    expect(res.json()).toMatchObject({
      nameEn: 'Kareem Adel',
      school: 'مدرسة النصر',
      status: 'archived',
      guardians: [{ phone: '01244444444', isPrimary: true }],
    });
    expect(res.json().guardians).toHaveLength(1);
    expect(await names(c.owner, 'kareem')).toEqual(['كريم']);
  });

  it('keeps more than one parent: extras replace extras, a promoted extra keeps one link', async () => {
    const res = await c.assistant('POST', 'students', {
      nameAr: 'سلمى',
      gradeLevelId: c.gradeId,
      guardian: guardian('01255555551'),
      extraGuardians: [guardian('01255555552', { relation: 'father' })],
    });
    expect(res.statusCode).toBe(201);
    const s = res.json();
    expect(s.guardians).toMatchObject([
      { phone: '01255555551', isPrimary: true },
      { phone: '01255555552', relation: 'father', isPrimary: false },
    ]);
    // Without extraGuardians the other parents stay; a new primary that was an extra is promoted.
    const promoted = (
      await c.owner('PATCH', `students/${s.id}`, { guardian: guardian('01255555552') })
    ).json();
    expect(promoted.guardians).toMatchObject([{ phone: '01255555552', isPrimary: true }]);
    expect(promoted.guardians).toHaveLength(1);
    // The extras list replaces the others; the old primary comes back as an extra.
    const swapped = (
      await c.owner('PATCH', `students/${s.id}`, {
        guardian: guardian('01255555552'),
        extraGuardians: [guardian('01255555551'), guardian('01255555553')],
      })
    ).json();
    expect(swapped.guardians.map((g: { phone: string }) => g.phone).sort()).toEqual([
      '01255555551',
      '01255555552',
      '01255555553',
    ]);
    const cleared = (
      await c.owner('PATCH', `students/${s.id}`, {
        guardian: guardian('01255555552'),
        extraGuardians: [],
      })
    ).json();
    expect(cleared.guardians).toMatchObject([{ phone: '01255555552', isPrimary: true }]);
    expect(cleared.guardians).toHaveLength(1);
  });

  it('rejects a repeated parent phone, and extras without the primary', async () => {
    const dup = await c.owner('POST', 'students', {
      nameAr: 'شريف',
      gradeLevelId: c.gradeId,
      guardian: guardian('01277777771'),
      extraGuardians: [guardian('01277777771')],
    });
    expect(dup.statusCode).toBe(400);
    expect(dup.json().details.issues).toEqual([{ path: 'extraGuardians.0.phone', code: 'custom' }]);
    const s = (
      await c.owner('POST', 'students', {
        nameAr: 'شريف',
        gradeLevelId: c.gradeId,
        guardian: guardian('01277777771'),
      })
    ).json();
    const alone = await c.owner('PATCH', `students/${s.id}`, {
      extraGuardians: [guardian('01277777772')],
    });
    expect(alone.statusCode).toBe(400);
    expect(alone.json().details.issues).toEqual([{ path: 'guardian', code: 'custom' }]);
  });

  it('rejects a grade level from another workspace', async () => {
    const other = await center();
    const res = await c.owner('POST', 'students', {
      nameAr: 'سارة',
      gradeLevelId: other.gradeId,
      guardian: guardian('01255555555'),
    });
    expect(res.statusCode).toBe(400);
    expect(res.json()).toEqual({
      code: 'STUDENT_REFERENCE_INVALID',
      details: { field: 'gradeLevelId' },
    });
  });

  it("returns 404 for an unknown or another workspace's student", async () => {
    const other = await center();
    const theirs = (
      await other.owner('POST', 'students', {
        nameAr: 'منة',
        gradeLevelId: other.gradeId,
        guardian: guardian('01266666666'),
      })
    ).json();
    for (const res of [
      await c.owner('GET', `students/${theirs.id}`),
      await c.owner('PATCH', `students/${theirs.id}`, { nameAr: 'تغيير' }),
      await c.owner('GET', 'students/00000000-0000-4000-8000-000000000000'),
    ])
      expect(res.json().code).toBe('STUDENT_NOT_FOUND');
    expect(await names(c.owner, 'منة')).toEqual([]);
    expect(await names(c.owner, '012666')).toEqual([]);
  });
});
