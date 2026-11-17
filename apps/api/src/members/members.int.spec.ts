import type { NestFastifyApplication } from '@nestjs/platform-fastify';
import { and, eq } from 'drizzle-orm';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { auditLog, invites, students } from '@dafter/db';
import { useTestDb } from '@dafter/db/testing';
import { createApp } from '../app.js';
import { REFRESH_COOKIE } from '../auth/auth.controller.js';
import { FakeClock } from '../clock.js';
import { INVITE_TTL_MS, STAFF_RESET_TTL_MS } from './members.service.js';

const testDb = useTestDb();
const clock = new FakeClock();
let app: NestFastifyApplication;

beforeAll(async () => {
  app = await createApp({ logger: false, db: testDb().db, clock });
  await app.init();
  await app.getHttpAdapter().getInstance().ready();
});
afterAll(() => app.close());

let n = 0;
async function staff() {
  const res = await app.inject({
    method: 'POST',
    url: '/api/v1/auth/register',
    payload: {
      name: 'منى حسن',
      phone: `0170000${String(++n).padStart(4, '0')}`,
      password: 'correct horse',
    },
  });
  return res.json().accessToken as string;
}

type Method = 'GET' | 'POST' | 'PUT' | 'DELETE';
const call = (method: Method, url: string, token: string, ws?: string, payload?: object) =>
  app.inject({
    method,
    url: `/api/v1/${url}`,
    payload,
    headers: { authorization: `Bearer ${token}`, ...(ws ? { 'x-workspace-id': ws } : {}) },
  });

/** An owner with a fresh workspace. */
async function owner() {
  const token = await staff();
  const ws = (
    await call('POST', 'workspaces', token, undefined, { type: 'center', nameAr: 'سنتر' })
  ).json().id as string;
  return { token, ws };
}

const invite = async (o: { token: string; ws: string }, role = 'teacher') =>
  (await call('POST', 'invites', o.token, o.ws, { role })).json().token as string;

/** A new staff user who joined o's workspace with the given role; returns their token. */
async function joined(o: { token: string; ws: string }, role: 'teacher' | 'assistant') {
  const token = await staff();
  await call('POST', `invites/${await invite(o, role)}/accept`, token);
  return token;
}

describe('invites', () => {
  it('owner invites, invitee accepts and becomes a member with the invited role', async () => {
    const o = await owner();
    const res = await call('POST', 'invites', o.token, o.ws, { role: 'assistant' });
    expect(res.statusCode).toBe(201);
    expect(new Date(res.json().expiresAt).getTime()).toBe(clock.now().getTime() + INVITE_TTL_MS);

    const invitee = await staff();
    const accepted = await call('POST', `invites/${res.json().token}/accept`, invitee);
    expect(accepted.statusCode).toBe(200);
    expect(accepted.json()).toMatchObject({ id: o.ws, role: 'assistant' });
    expect((await call('GET', 'workspaces/current', invitee, o.ws)).statusCode).toBe(200);
  });

  it('is single use', async () => {
    const o = await owner();
    const token = await invite(o);
    await call('POST', `invites/${token}/accept`, await staff());
    const again = await call('POST', `invites/${token}/accept`, await staff());
    expect([again.statusCode, again.json().code]).toEqual([410, 'INVITE_INVALID']);
  });

  it('expires after 72 hours', async () => {
    const o = await owner();
    const token = await invite(o);
    clock.advance(INVITE_TTL_MS);
    const res = await call('POST', `invites/${token}/accept`, await staff());
    expect(res.json().code).toBe('INVITE_INVALID');
  });

  it('rejects an unknown token the same way', async () => {
    const res = await call('POST', 'invites/not-a-token/accept', await staff());
    expect([res.statusCode, res.json().code]).toEqual([410, 'INVITE_INVALID']);
  });

  it('keeps the invite unused when the caller is already a member', async () => {
    const o = await owner();
    const token = await invite(o);
    const res = await call('POST', `invites/${token}/accept`, o.token);
    expect([res.statusCode, res.json().code]).toEqual([409, 'ALREADY_MEMBER']);
    expect((await call('POST', `invites/${token}/accept`, await staff())).statusCode).toBe(200);
  });

  it('only the owner invites, and never as owner', async () => {
    const o = await owner();
    const teacher = await joined(o, 'teacher');
    expect((await call('POST', 'invites', teacher, o.ws, { role: 'teacher' })).json().code).toBe(
      'FORBIDDEN',
    );
    expect((await call('POST', 'invites', o.token, o.ws, { role: 'owner' })).json().code).toBe(
      'VALIDATION_FAILED',
    );
  });
});

describe('invite preview, pending list and revoke (audit 3 A10, A13)', () => {
  it('names the center and the role before sign-in, for a usable invite only', async () => {
    const o = await owner();
    const token = await invite(o, 'assistant');
    const res = await app.inject({ method: 'GET', url: `/api/v1/invites/${token}` });
    expect(res.statusCode).toBe(200);
    expect(res.json()).toEqual({
      workspaceNameAr: 'سنتر',
      workspaceNameEn: null,
      workspaceType: 'center',
      role: 'assistant',
    });
    await call('POST', `invites/${token}/accept`, await staff());
    const used = await app.inject({ method: 'GET', url: `/api/v1/invites/${token}` });
    expect([used.statusCode, used.json().code]).toEqual([410, 'INVITE_INVALID']);
    const unknown = await app.inject({ method: 'GET', url: '/api/v1/invites/not-a-token' });
    expect(unknown.json().code).toBe('INVITE_INVALID');
    const later = await invite(o, 'teacher');
    clock.advance(INVITE_TTL_MS);
    const expired = await app.inject({ method: 'GET', url: `/api/v1/invites/${later}` });
    expect(expired.json().code).toBe('INVITE_INVALID');
  });

  it('lists pending invites, newest first, without used ones', async () => {
    const o = await owner();
    await invite(o, 'teacher');
    clock.advance(1000);
    const newest = (await call('POST', 'invites', o.token, o.ws, { role: 'assistant' })).json();
    await call('POST', `invites/${await invite(o)}/accept`, await staff());
    const list = (await call('GET', 'invites', o.token, o.ws)).json();
    expect(list.map((i: { role: string }) => i.role)).toEqual(['assistant', 'teacher']);
    expect(list[0]).toEqual({
      id: newest.id,
      role: 'assistant',
      expiresAt: newest.expiresAt,
      createdAt: expect.any(String),
      invitedBy: 'منى حسن',
    });
    expect(list[0]).not.toHaveProperty('token');
  });

  it('shows no sender for an invite made before the sender was recorded', async () => {
    const o = await owner();
    const { id } = (await call('POST', 'invites', o.token, o.ws, { role: 'teacher' })).json();
    await testDb()
      .db.update(invites)
      .set({ createdByMembershipId: null })
      .where(eq(invites.id, id));
    const [row] = (await call('GET', 'invites', o.token, o.ws)).json();
    expect(row).toMatchObject({ id, invitedBy: null });
  });

  it('revokes: the link stops working and the invite leaves the list', async () => {
    const o = await owner();
    const created = (await call('POST', 'invites', o.token, o.ws, { role: 'teacher' })).json();
    const res = await call('DELETE', `invites/${created.id}`, o.token, o.ws);
    expect(res.statusCode).toBe(204);
    expect((await call('GET', 'invites', o.token, o.ws)).json()).toEqual([]);
    const accept = await call('POST', `invites/${created.token}/accept`, await staff());
    expect(accept.json().code).toBe('INVITE_INVALID');
    // A second revoke finds nothing pending.
    expect((await call('DELETE', `invites/${created.id}`, o.token, o.ws)).statusCode).toBe(404);
  });

  it('is owner only, and another workspace sees none of it (404, never 403)', async () => {
    const o = await owner();
    const created = (await call('POST', 'invites', o.token, o.ws, { role: 'teacher' })).json();
    const teacher = await joined(o, 'teacher');
    expect((await call('GET', 'invites', teacher, o.ws)).json().code).toBe('FORBIDDEN');
    expect((await call('DELETE', `invites/${created.id}`, teacher, o.ws)).json().code).toBe(
      'FORBIDDEN',
    );

    const other = await owner();
    expect((await call('GET', 'invites', other.token, other.ws)).json()).toEqual([]);
    const cross = await call('DELETE', `invites/${created.id}`, other.token, other.ws);
    expect([cross.statusCode, cross.json().code]).toEqual([404, 'NOT_FOUND']);
    // Still pending in its own workspace.
    expect((await call('GET', 'invites', o.token, o.ws)).json()).toHaveLength(1);
  });
});

describe('members and assistant scopes', () => {
  it('owner sets the teachers an assistant works for', async () => {
    const o = await owner();
    await joined(o, 'teacher');
    await joined(o, 'assistant');
    const members = (await call('GET', 'members', o.token, o.ws)).json() as {
      id: string;
      role: string;
    }[];
    const teacher = members.find((m) => m.role === 'teacher')!;
    const assistant = members.find((m) => m.role === 'assistant')!;

    const res = await call('PUT', `members/${assistant.id}/scopes`, o.token, o.ws, {
      teacherMembershipIds: [teacher.id, teacher.id],
    });
    expect(res.statusCode).toBe(204);
    const after = (await call('GET', 'members', o.token, o.ws)).json();
    expect(after.find((m: { id: string }) => m.id === assistant.id).teacherMembershipIds).toEqual([
      teacher.id,
    ]);
  });

  it('rejects non-teacher targets, non-assistant members and non-owners', async () => {
    const o = await owner();
    const assistantToken = await joined(o, 'assistant');
    const other = await owner();
    await joined(other, 'teacher');
    const [otherTeacher] = (await call('GET', 'members', other.token, other.ws))
      .json()
      .filter((m: { role: string }) => m.role === 'teacher');
    const members = (await call('GET', 'members', o.token, o.ws)).json();
    const ownerId = members.find((m: { role: string }) => m.role === 'owner').id;
    const assistantId = members.find((m: { role: string }) => m.role === 'assistant').id;

    const put = (token: string, id: string, ids: string[]) =>
      call('PUT', `members/${id}/scopes`, token, o.ws, { teacherMembershipIds: ids });
    expect((await put(o.token, assistantId, [otherTeacher.id])).json().code).toBe(
      'SCOPE_TEACHER_INVALID',
    );
    expect((await put(o.token, assistantId, [assistantId])).json().code).toBe(
      'SCOPE_TEACHER_INVALID',
    );
    expect((await put(o.token, ownerId, [])).json().code).toBe('MEMBER_NOT_ASSISTANT');
    // Another workspace's membership is a 404 here, never a 403.
    expect((await put(o.token, otherTeacher.id, [])).json().code).toBe('NOT_FOUND');
    expect((await put(assistantToken, assistantId, [ownerId])).json().code).toBe('FORBIDDEN');
  });
});

describe('audit log', () => {
  it('records a successful write with actor, workspace, route pattern and entity id', async () => {
    const o = await owner();
    const res = await call('POST', 'invites', o.token, o.ws, { role: 'teacher' });
    const rows = await testDb()
      .db.select()
      .from(auditLog)
      .where(and(eq(auditLog.workspaceId, o.ws), eq(auditLog.entity, 'invites')));
    expect(rows).toEqual([
      expect.objectContaining({
        action: 'POST /api/v1/invites',
        entityId: res.json().id,
        after: null,
      }),
    ]);
    expect(rows[0]!.actorId).toBeTruthy();
  });

  const rowsFor = (ws: string) =>
    testDb().db.select().from(auditLog).where(eq(auditLog.workspaceId, ws));

  it('records nothing for reads or failed writes', async () => {
    const o = await owner();
    await call('GET', 'members', o.token, o.ws);
    await call('POST', 'invites', o.token, o.ws, { role: 'owner' });
    // Only the workspace's own creation, filed under the new workspace.
    expect((await rowsFor(o.ws)).map((r) => [r.action, r.entityId])).toEqual([
      ['POST /api/v1/workspaces', o.ws],
    ]);
  });

  it('files an accept under the joined workspace with the invite id', async () => {
    const o = await owner();
    const created = (await call('POST', 'invites', o.token, o.ws, { role: 'teacher' })).json();
    await call('POST', `invites/${created.token}/accept`, await staff());
    const row = (await rowsFor(o.ws)).find((r) => r.action.endsWith('/accept'));
    expect(row).toMatchObject({ entity: 'invites', entityId: created.id });
  });

  it('takes the entity id from the path when the response has no body', async () => {
    const o = await owner();
    await joined(o, 'assistant');
    const members = (await call('GET', 'members', o.token, o.ws)).json();
    const assistantId = members.find((m: { role: string }) => m.role === 'assistant').id;
    await call('PUT', `members/${assistantId}/scopes`, o.token, o.ws, { teacherMembershipIds: [] });
    const row = (await rowsFor(o.ws)).find((r) => r.action.endsWith('/scopes'));
    expect(row?.entityId).toBe(assistantId);
  });

  it('skips token refresh', async () => {
    const reg = await app.inject({
      method: 'POST',
      url: '/api/v1/auth/register',
      payload: { name: 'منى', phone: '01799999999', password: 'correct horse' },
    });
    const cookie = reg.cookies.find((c) => c.name === REFRESH_COOKIE)!;
    const refreshed = await app.inject({
      method: 'POST',
      url: '/api/v1/auth/refresh',
      cookies: { [cookie.name]: cookie.value },
    });
    expect(refreshed.statusCode).toBe(200);
    const rows = await testDb()
      .db.select()
      .from(auditLog)
      .where(eq(auditLog.action, 'POST /api/v1/auth/refresh'));
    expect(rows).toEqual([]);
  });
});

describe('owner-issued password reset link', () => {
  const members = async (o: { token: string; ws: string }) =>
    (await call('GET', 'members', o.token, o.ws)).json() as {
      id: string;
      userId: string;
      phone: string;
      role: string;
    }[];
  const reset = (o: { token: string; ws: string }, id: string, token = o.token) =>
    call('POST', `members/${id}/password-reset`, token, o.ws);

  it('lets the owner reset a staff member whose account is only in this workspace', async () => {
    const o = await owner();
    await joined(o, 'assistant');
    const assistant = (await members(o)).find((m) => m.role === 'assistant')!;
    const res = await reset(o, assistant.id);
    expect(res.statusCode).toBe(201);
    const { token, expiresAt } = res.json();
    expect(Date.parse(expiresAt) - clock.now().getTime()).toBe(STAFF_RESET_TTL_MS);

    const confirm = (password: string) =>
      app.inject({
        method: 'POST',
        url: '/api/v1/auth/password-reset/confirm',
        payload: { token, password },
      });
    expect((await confirm('brand new horse')).statusCode).toBe(204);
    const login = await app.inject({
      method: 'POST',
      url: '/api/v1/auth/login',
      payload: { login: assistant.phone, password: 'brand new horse' },
    });
    expect(login.statusCode).toBe(200);
    expect((await confirm('another horse')).statusCode).toBe(410);
  });

  it('expires after 24 hours', async () => {
    const o = await owner();
    await joined(o, 'teacher');
    const teacher = (await members(o)).find((m) => m.role === 'teacher')!;
    const { token } = (await reset(o, teacher.id)).json();
    clock.advance(STAFF_RESET_TTL_MS);
    const res = await app.inject({
      method: 'POST',
      url: '/api/v1/auth/password-reset/confirm',
      payload: { token, password: 'brand new horse' },
    });
    expect(res.statusCode).toBe(410);
  });

  it('refuses owners, accounts in another workspace, students, non-owners and unknown members', async () => {
    const o = await owner();
    const assistantToken = await joined(o, 'assistant');
    const teacherToken = await joined(o, 'teacher');
    const list = await members(o);
    const byRole = (r: string) => list.find((m) => m.role === r)!;
    const notAllowed = async (id: string) => {
      const res = await reset(o, id);
      expect(res.statusCode).toBe(409);
      expect(res.json().code).toBe('RESET_NOT_ALLOWED');
    };

    await notAllowed(byRole('owner').id);
    // The teacher also owns a workspace of their own.
    const own = await call('POST', 'workspaces', teacherToken, undefined, {
      type: 'independent',
      nameAr: 'دروسي',
    });
    expect(own.statusCode).toBe(201);
    await notAllowed(byRole('teacher').id);
    // The assistant is also someone's student account.
    const [grade] = (await call('GET', 'grade-levels', o.token, o.ws)).json();
    await testDb()
      .db.insert(students)
      .values({
        workspaceId: o.ws,
        nameAr: 'طالب',
        nameSearch: 'طالب',
        gradeLevelId: grade.id,
        userId: byRole('assistant').userId,
      });
    await notAllowed(byRole('assistant').id);

    expect((await reset(o, byRole('teacher').id, assistantToken)).statusCode).toBe(403);
    expect((await reset(o, crypto.randomUUID())).json().code).toBe('NOT_FOUND');
    const other = await owner();
    expect((await reset(other, byRole('teacher').id)).json().code).toBe('NOT_FOUND');
  });
});
