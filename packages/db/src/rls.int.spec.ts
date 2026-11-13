import { sql } from 'drizzle-orm';
import { beforeAll, describe, expect, it } from 'vitest';
import { assistantScopes, auditLog, invites, memberships } from './schema.js';
import { type Tx, withTenant } from './tenant.js';
import { makeMembership, makeUser, makeWorkspace, useTestDb } from './testing/index.js';

const t = useTestDb();

/** Tenant tables = `workspaces` plus every public table with a workspace_id column. */
async function tenantTables() {
  const { rows } = await t().db.execute<{ table_name: string }>(
    sql`select table_name from information_schema.columns
        where table_schema = 'public' and column_name = 'workspace_id' order by table_name`,
  );
  return ['workspaces', ...rows.map((r) => r.table_name)];
}

const col = (table: string) => sql.raw(table === 'workspaces' ? 'id' : 'workspace_id');

let a: string;
let b: string;
let tables: string[];

// One row of A's in every tenant table. A new tenant table needs a row here, or the
// "sees its own rows" test below fails and points at it.
beforeAll(async () => {
  const { db } = t();
  a = (await makeWorkspace(db)).id;
  b = (await makeWorkspace(db)).id;
  const owner = await makeMembership(db, { workspaceId: a, userId: (await makeUser(db)).id });
  const assistant = await makeMembership(db, {
    workspaceId: a,
    userId: (await makeUser(db)).id,
    role: 'assistant',
  });
  await makeMembership(db, { workspaceId: b, userId: (await makeUser(db)).id });
  await db.insert(assistantScopes).values({
    workspaceId: a,
    membershipId: assistant.id,
    teacherMembershipId: owner.id,
  });
  await db
    .insert(invites)
    .values({ workspaceId: a, role: 'teacher', tokenHash: 'h', expiresAt: new Date() });
  await db.insert(auditLog).values({ workspaceId: a, action: 'create', entity: 'test' });
  tables = await tenantTables();
});

const count = async (tx: Tx, table: string) => {
  const { rows } = await tx.execute<{ n: number }>(
    sql`select count(*)::int as n from ${sql.raw(table)} where ${col(table)} = ${a}`,
  );
  return rows[0]!.n;
};

describe('RLS on every tenant table', () => {
  it('finds the tenant tables', () => {
    expect(tables).toEqual(
      expect.arrayContaining(['workspaces', 'memberships', 'assistant_scopes', 'invites']),
    );
  });

  it('has row-level security enabled', async () => {
    const { rows } = await t().db.execute<{ relname: string; relrowsecurity: boolean }>(
      sql`select relname, relrowsecurity from pg_class
          where relnamespace = 'public'::regnamespace and relkind = 'r'`,
    );
    const off = rows.filter((r) => tables.includes(r.relname) && !r.relrowsecurity);
    expect(off.map((r) => r.relname)).toEqual([]);
  });

  it('shows a workspace its own rows', async () => {
    for (const table of tables)
      expect(await withTenant(t().db, a, (tx) => count(tx, table)), table).toBeGreaterThan(0);
  });

  it("shows another workspace none of A's rows", async () => {
    for (const table of tables)
      expect(await withTenant(t().db, b, (tx) => count(tx, table)), table).toBe(0);
  });

  it('shows nothing when app.workspace_id is not set', async () => {
    for (const table of tables) {
      const n = await t().db.transaction(async (tx) => {
        await tx.execute(sql`set local role dafter_app`);
        const { rows } = await tx.execute<{ n: number }>(
          sql`select count(*)::int as n from ${sql.raw(table)}`,
        );
        return rows[0]!.n;
      });
      expect(n, table).toBe(0);
    }
  });

  it('rejects writing a row into another workspace', async () => {
    const user = await makeUser(t().db);
    const write = withTenant(t().db, b, (tx) =>
      tx.insert(memberships).values({ workspaceId: a, userId: user.id, role: 'teacher' }),
    );
    await expect(write).rejects.toMatchObject({ cause: { code: '42501' } });
  });
});
