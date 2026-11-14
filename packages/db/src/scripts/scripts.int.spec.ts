import { sql } from 'drizzle-orm';
import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from 'vitest';
import { createDb } from '../client.js';
import { createTestDb, type TestDb } from '../testing/test-db.js';
import { databaseUrl } from './env.js';
import { main as migrate } from './migrate.js';
import { main as reset } from './reset.js';
import { main as seedDemo } from './seed-demo.js';
import { main as seed } from './seed.js';

/** The package.json scripts (pnpm db:reset, db:seed, db:seed:demo, migrate) on throwaway databases. */
const dbs: TestDb[] = [];
const fresh = async () => {
  const t = await createTestDb();
  dbs.push(t);
  vi.stubEnv('DATABASE_URL', t.url);
  vi.stubEnv('DATABASE_URL_UNPOOLED', '');
  return t;
};
const count = async (url: string, table: string) => {
  const { db, pool } = createDb(url);
  try {
    const { rows } = await db.execute(sql.raw(`select count(*)::int as n from ${table}`));
    return (rows[0] as { n: number }).n;
  } finally {
    await pool.end();
  }
};

beforeAll(() => {
  vi.spyOn(console, 'log').mockImplementation(() => {});
});
afterEach(() => vi.unstubAllEnvs());
afterAll(() => Promise.all(dbs.map((t) => t.close())));

describe('databaseUrl', () => {
  it('prefers the direct URL and needs one of the two', () => {
    vi.stubEnv('DATABASE_URL', 'postgres://pooled');
    vi.stubEnv('DATABASE_URL_UNPOOLED', 'postgres://direct');
    expect(databaseUrl()).toBe('postgres://direct');
    vi.stubEnv('DATABASE_URL', '');
    vi.stubEnv('DATABASE_URL_UNPOOLED', '');
    expect(() => databaseUrl()).toThrow('DATABASE_URL is not set');
  });
});

describe('scripts', () => {
  it('reset drops, migrates and seeds; migrate is a no-op after it', async () => {
    const t = await fresh();
    await reset();
    expect(await count(t.url, 'workspaces')).toBe(2);
    await migrate();
    expect(await count(t.url, 'workspaces')).toBe(2);
  });

  it('reset refuses a database that is not local', async () => {
    vi.stubEnv('DATABASE_URL', 'postgres://u:p@db.example.com/dafter');
    vi.stubEnv('DATABASE_URL_UNPOOLED', '');
    await expect(reset()).rejects.toThrow('Refusing to reset a non-local database');
  });

  it('seed adds the staff and workspaces to an empty database', async () => {
    const t = await fresh();
    await seed();
    expect(await count(t.url, 'users')).toBeGreaterThanOrEqual(3);
  });

  it('seed:demo adds the base seed when missing, the demo once, and skips a rerun', async () => {
    const t = await fresh();
    await seedDemo();
    const students = await count(t.url, 'students');
    expect(students).toBe(12);
    expect(await count(t.url, 'groups')).toBe(3);
    await seedDemo();
    expect(await count(t.url, 'students')).toBe(students);
  });
});
