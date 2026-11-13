import { sql } from 'drizzle-orm';
import { describe, expect, it } from 'vitest';
import { assistantScopes, memberships, users } from './schema.js';
import { makeMembership, makeUser, makeWorkspace, useTestDb } from './testing/index.js';

const t = useTestDb();

/** Resolves to the PostgreSQL error code a query failed with (drizzle wraps it in `cause`). */
const pgCode = (query: Promise<unknown>) =>
  query.then(
    () => 'no error',
    (err: { code?: string; cause?: { code?: string } }) => err.cause?.code ?? err.code,
  );

describe('first migration', () => {
  it('creates every v0 account table', async () => {
    const { rows } = await t().db.execute<{ table_name: string }>(
      sql`select table_name from information_schema.tables where table_schema = 'public'`,
    );
    // Contains, not equals: later migrations add tables.
    expect(rows.map((r) => r.table_name)).toEqual(
      expect.arrayContaining([
        'assistant_scopes',
        'audit_log',
        'invites',
        'memberships',
        'refresh_tokens',
        'users',
        'workspaces',
      ]),
    );
  });
});

describe('users', () => {
  it('rejects a second user with the same phone', async () => {
    const { db } = t();
    await makeUser(db, { phone: '01111111111' });
    expect(await pgCode(makeUser(db, { phone: '01111111111' }))).toBe('23505');
  });

  it('treats emails as case-insensitive', async () => {
    const { db } = t();
    await makeUser(db, { email: 'Mona@Example.com' });
    expect(await pgCode(makeUser(db, { email: 'mona@example.com' }))).toBe('23505');
  });

  it('requires a phone or an email', async () => {
    const insert = t().db.insert(users).values({ name: 'بدون تواصل' });
    expect(await pgCode(insert)).toBe('23514');
  });
});

describe('memberships', () => {
  it('allows one membership per user and workspace', async () => {
    const { db } = t();
    const [user, ws] = await Promise.all([makeUser(db), makeWorkspace(db)]);
    await makeMembership(db, { workspaceId: ws.id, userId: user.id });
    const again = db
      .insert(memberships)
      .values({ workspaceId: ws.id, userId: user.id, role: 'owner' });
    expect(await pgCode(again)).toBe('23505');
  });

  it('keeps an assistant scope inside one workspace', async () => {
    const { db } = t();
    const [a, b, assistantUser, teacherUser] = await Promise.all([
      makeWorkspace(db),
      makeWorkspace(db),
      makeUser(db),
      makeUser(db),
    ]);
    const assistant = await makeMembership(db, {
      workspaceId: a.id,
      userId: assistantUser.id,
      role: 'assistant',
    });
    const teacherInB = await makeMembership(db, { workspaceId: b.id, userId: teacherUser.id });

    const crossTenant = db.insert(assistantScopes).values({
      workspaceId: a.id,
      membershipId: assistant.id,
      teacherMembershipId: teacherInB.id,
    });
    expect(await pgCode(crossTenant)).toBe('23503');
  });
});
