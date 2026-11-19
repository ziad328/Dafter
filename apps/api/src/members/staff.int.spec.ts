import type { NestFastifyApplication } from '@nestjs/platform-fastify';
import { and, eq, sql } from 'drizzle-orm';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { auditLog, withTenant } from '@dafter/db';
import { useTestDb } from '@dafter/db/testing';
import { createApp } from '../app.js';
import { FakeClock } from '../clock.js';
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
});
afterAll(() => app.close());

type Member = { id: string; userId: string; role: string; teacherMembershipIds: string[] };

async function setup() {
  const c = await f.center();
  const members = async () => (await c.owner('GET', 'members')).json() as Member[];
  const byRole = async (role: string) => (await members()).find((m) => m.role === role)!;
  /** A new user who accepts an invite of `role` (with teachers); returns their calls and id. */
  const join = async (role: 'teacher' | 'assistant', teacherMembershipIds?: string[]) => {
    const inv = await c.owner('POST', 'invites', { role, teacherMembershipIds });
    const u = await f.register();
    const res = await f.post(`invites/${inv.json().token}/accept`, {}, f.bearer(u.token));
    const as: Call = (method, url, payload) =>
      app.inject({
        method,
        url: `/api/v1/${url}`,
        payload,
        headers: { ...f.bearer(u.token), 'x-workspace-id': c.workspaceId },
      });
    const id = (await members()).find((m) => m.userId === u.userId)?.id;
    return { res, as, id: id!, token: u.token, userId: u.userId };
  };
  return { c, members, byRole, join };
}

describe('invites carry an assistant’s teachers', () => {
  it('writes the teachers on accept, in one step, and checks them when inviting', async () => {
    const { c, byRole, join } = await setup();
    const teacher = await byRole('teacher');
    const owner = await byRole('owner');
    const inv = await c.owner('POST', 'invites', {
      role: 'assistant',
      teacherMembershipIds: [teacher.id, owner.id, teacher.id],
    });
    expect(inv.json().teacherMembershipIds.sort()).toEqual([teacher.id, owner.id].sort());

    const a = await join('assistant', [teacher.id]);
    expect(a.res.statusCode).toBe(200);
    expect(a.res.json()).toMatchObject({ id: c.workspaceId, role: 'assistant', nameAr: 'سنتر' });
    const listed = (await c.owner('GET', 'members')).json() as Member[];
    expect(listed.find((m) => m.id === a.id)?.teacherMembershipIds).toEqual([teacher.id]);
    // Scoped from the first request: the teacher's group is visible.
    expect((await a.as('GET', 'groups')).json()).toHaveLength(1);

    const bad = await c.owner('POST', 'invites', {
      role: 'assistant',
      teacherMembershipIds: [a.id],
    });
    expect(bad.json().code).toBe('SCOPE_TEACHER_INVALID');
    const forTeacher = await c.owner('POST', 'invites', {
      role: 'teacher',
      teacherMembershipIds: [teacher.id],
    });
    expect(forTeacher.json().code).toBe('VALIDATION_FAILED');
  });

  it('skips a teacher removed between the invite and the accept', async () => {
    const { c, members, join } = await setup();
    const t2 = await join('teacher');
    const inv = await c.owner('POST', 'invites', {
      role: 'assistant',
      teacherMembershipIds: [t2.id],
    });
    await c.owner('PATCH', `members/${t2.id}`, { status: 'removed' });
    const u = await f.register();
    await f.post(`invites/${inv.json().token}/accept`, {}, f.bearer(u.token));
    const assistant = (await members()).find((m) => m.userId === u.userId)!;
    expect(assistant.teacherMembershipIds).toEqual([]);
  });
});

describe('PUT /members/:id/scopes', () => {
  it('never leaves a teacher removed at the same moment in a scope', async () => {
    const { c, members, join } = await setup();
    const a = await join('assistant');
    for (let i = 0; i < 5; i++) {
      const t = await join('teacher');
      const [removed, scoped] = await Promise.all([
        c.owner('PATCH', `members/${t.id}`, { status: 'removed' }),
        c.owner('PUT', `members/${a.id}/scopes`, { teacherMembershipIds: [t.id] }),
      ]);
      expect(removed.statusCode).toBe(200);
      // Either the scope was written first (and the removal took it away), or the check saw them gone.
      expect([204, 'SCOPE_TEACHER_INVALID']).toContain(
        scoped.statusCode === 204 ? 204 : scoped.json().code,
      );
      expect((await members()).find((m) => m.id === a.id)!.teacherMembershipIds).toEqual([]);
    }
  });

  it('answers NOT_FOUND and MEMBER_NOT_ASSISTANT from inside the transaction', async () => {
    const { c, byRole } = await setup();
    const teacher = await byRole('teacher');
    const none = await c.owner('PUT', `members/${crypto.randomUUID()}/scopes`, {
      teacherMembershipIds: [],
    });
    expect(none.json().code).toBe('NOT_FOUND');
    const notAssistant = await c.owner('PUT', `members/${teacher.id}/scopes`, {
      teacherMembershipIds: [],
    });
    expect(notAssistant.json().code).toBe('MEMBER_NOT_ASSISTANT');
  });
});

describe('PATCH /members/:id', () => {
  it('changes roles; scopes follow the role; teaching blocks becoming an assistant', async () => {
    const { c, byRole, join } = await setup();
    const teacher = await byRole('teacher');
    const a = await join('assistant', [teacher.id]);

    // Still teaching an active group: reassign first.
    const blocked = await c.owner('PATCH', `members/${teacher.id}`, { role: 'assistant' });
    expect([blocked.statusCode, blocked.json()]).toEqual([
      409,
      { code: 'MEMBER_TEACHES_GROUPS', details: { count: 1 } },
    ]);
    // An assistant who becomes a teacher drops their own scopes.
    const promoted = await c.owner('PATCH', `members/${a.id}`, { role: 'teacher' });
    expect(promoted.json()).toMatchObject({
      id: a.id,
      role: 'teacher',
      status: 'active',
      teacherMembershipIds: [],
    });
    // A teacher with no groups who becomes an assistant drops the scopes naming them.
    const b = await join('assistant', [a.id]);
    await c.owner('PATCH', `members/${a.id}`, { role: 'assistant' });
    const after = (await c.owner('GET', 'members')).json() as Member[];
    expect(after.find((m) => m.id === b.id)?.teacherMembershipIds).toEqual([]);
    // A second owner, then that owner can manage people.
    await c.owner('PATCH', `members/${a.id}`, { role: 'owner' });
    expect((await a.as('GET', 'members')).statusCode).toBe(200);
  });

  it('only the owner; unknown or another workspace’s member is 404; one change at a time', async () => {
    const { c, byRole } = await setup();
    const teacher = await byRole('teacher');
    expect((await c.teacher('PATCH', `members/${teacher.id}`, { role: 'owner' })).json().code).toBe(
      'FORBIDDEN',
    );
    const other = await setup();
    const res = await other.c.owner('PATCH', `members/${teacher.id}`, { status: 'removed' });
    expect([res.statusCode, res.json().code]).toEqual([404, 'NOT_FOUND']);
    for (const body of [{}, { role: 'teacher', status: 'removed' }, { status: 'active' }])
      expect((await c.owner('PATCH', `members/${teacher.id}`, body)).json().code).toBe(
        'VALIDATION_FAILED',
      );
  });

  it('never leaves a workspace without an owner, even with two removals at once', async () => {
    const { c, byRole, join } = await setup();
    const owner = await byRole('owner');
    expect((await c.owner('PATCH', `members/${owner.id}`, { role: 'teacher' })).json().code).toBe(
      'LAST_OWNER',
    );
    expect((await c.owner('PATCH', `members/${owner.id}`, { status: 'removed' })).json().code).toBe(
      'LAST_OWNER',
    );
    const second = await join('teacher');
    await c.owner('PATCH', `members/${second.id}`, { role: 'owner' });
    // Each removes the other at the same moment: the owner-row lock lets exactly one through.
    const [x, y] = await Promise.all([
      c.owner('PATCH', `members/${second.id}`, { status: 'removed' }),
      second.as('PATCH', `members/${owner.id}`, { status: 'removed' }),
    ]);
    // Exactly one goes through. The other is LAST_OWNER (it waited on the lock) or 404 (it
    // arrived after the commit, and its sender is no longer a member).
    const codes = [x, y].map((r) => r.statusCode).sort();
    expect(codes[0]).toBe(200);
    expect([404, 409]).toContain(codes[1]);
    const left = await withTenant(testDb().db, c.workspaceId, (tx) =>
      tx.execute<{ n: number }>(
        sql`select count(*)::int as n from memberships
            where workspace_id = ${c.workspaceId} and role = 'owner' and status = 'active'`,
      ),
    );
    expect(left.rows[0]!.n).toBe(1);
  });
});

describe('removing a member', () => {
  it('locks them out at once, keeps their groups flagged, and lets them be invited back', async () => {
    const { c, byRole, join } = await setup();
    const teacher = await byRole('teacher');
    const a = await join('assistant', [teacher.id]);
    const removed = await c.owner('PATCH', `members/${teacher.id}`, { status: 'removed' });
    expect(removed.json()).toMatchObject({ id: teacher.id, status: 'removed' });

    // The teacher's access token is still valid, but they are no longer a member.
    const locked = await c.teacher('GET', 'groups');
    expect([locked.statusCode, locked.json().code]).toEqual([404, 'WORKSPACE_NOT_FOUND']);
    const list = (await c.owner('GET', 'members')).json() as Member[];
    expect(list.map((m) => m.id)).not.toContain(teacher.id);
    expect(list.find((m) => m.id === a.id)?.teacherMembershipIds).toEqual([]);
    const [group] = (await c.owner('GET', 'groups')).json();
    expect(group).toMatchObject({ teacherMembershipId: teacher.id, teacherRemoved: true });
    // A removed teacher can't be picked for a group, nor removed twice.
    const pick = await c.owner('PATCH', `groups/${group.id}`, { teacherMembershipId: teacher.id });
    expect(pick.json()).toMatchObject({ code: 'GROUP_REFERENCE_INVALID' });
    expect(
      (await c.owner('PATCH', `members/${teacher.id}`, { status: 'removed' })).json().code,
    ).toBe('NOT_FOUND');
    // Reassigned: the flag goes.
    const owner = await byRole('owner');
    await c.owner('PATCH', `groups/${group.id}`, { teacherMembershipId: owner.id });
    expect((await c.owner('GET', `groups/${group.id}`)).json().teacherRemoved).toBe(false);

    // Invited back, as an assistant this time: the same membership row is active again.
    const back = await c.owner('POST', 'invites', { role: 'assistant' });
    const [row] = await withTenant(testDb().db, c.workspaceId, (tx) =>
      tx.execute<{ user_id: string }>(
        sql`select user_id from memberships where id = ${teacher.id}`,
      ),
    ).then((r) => r.rows);
    const login = await app.inject({
      method: 'POST',
      url: '/api/v1/auth/login',
      payload: { login: (await userPhone(row!.user_id))!, password: 'correct horse' },
    });
    const res = await f.post(
      `invites/${back.json().token}/accept`,
      {},
      f.bearer(login.json().accessToken),
    );
    expect(res.json()).toMatchObject({ role: 'assistant' });
    expect((await c.teacher('GET', 'groups')).statusCode).toBe(200);
    // A current member can't use another invite.
    const again = await c.owner('POST', 'invites', { role: 'teacher' });
    const dup = await f.post(
      `invites/${again.json().token}/accept`,
      {},
      f.bearer(login.json().accessToken),
    );
    expect(dup.json().code).toBe('ALREADY_MEMBER');
  });
});

describe('audit in the request transaction', () => {
  it('rolls the write back when its audit row fails, and commits both otherwise', async () => {
    const { c, byRole, join } = await setup();
    const t2 = await join('teacher');
    const audited = () =>
      withTenant(testDb().db, c.workspaceId, (tx) =>
        tx
          .select()
          .from(auditLog)
          .where(
            and(
              eq(auditLog.workspaceId, c.workspaceId),
              eq(auditLog.action, 'PATCH /api/v1/members/:id'),
            ),
          ),
      );
    await testDb().db.execute(sql`revoke insert on audit_log from dafter_app`);
    try {
      const res = await c.owner('PATCH', `members/${t2.id}`, { role: 'owner' });
      expect(res.statusCode).toBe(500);
    } finally {
      await testDb().db.execute(sql`grant insert on audit_log to dafter_app`);
    }
    expect((await byRole('owner')).id).not.toBe(t2.id);
    expect((await c.owner('GET', 'members')).json().find((m: Member) => m.id === t2.id).role).toBe(
      'teacher',
    );
    expect(await audited()).toHaveLength(0);

    await c.owner('PATCH', `members/${t2.id}`, { role: 'owner' });
    expect(await audited()).toMatchObject([{ entityId: t2.id }]);
  });
});

async function userPhone(userId: string) {
  const { rows } = await testDb().db.execute<{ phone: string }>(
    sql`select phone from users where id = ${userId}`,
  );
  return rows[0]?.phone;
}
