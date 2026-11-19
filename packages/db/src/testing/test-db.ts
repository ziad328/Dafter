import { randomUUID } from 'node:crypto';
import { setTimeout as sleep } from 'node:timers/promises';
import { Client } from 'pg';
import { afterAll, beforeAll, inject } from 'vitest';
import { createDb, type Db } from '../client.js';
import { TEMPLATE_DB } from './template.js';

// Set by global-setup.ts; declared here because every consumer imports this file.
declare module 'vitest' {
  export interface ProvidedContext {
    pgUrl: string;
  }
}

export interface TestDb {
  db: Db;
  url: string;
  close: () => Promise<void>;
}

function withDatabase(url: string, name: string) {
  const u = new URL(url);
  u.pathname = `/${name}`;
  return u.toString();
}

/** A fresh database cloned from the migrated template, private to the caller. */
export async function createTestDb(): Promise<TestDb> {
  const base = inject('pgUrl');
  const name = `t_${randomUUID().replaceAll('-', '')}`;
  const admin = new Client({ connectionString: withDatabase(base, 'postgres') });
  await admin.connect();
  try {
    // Parallel clones of one template can collide (55006 "source database is being accessed").
    for (let attempt = 1; ; attempt++) {
      try {
        await admin.query(`CREATE DATABASE "${name}" TEMPLATE "${TEMPLATE_DB}"`);
        break;
      } catch (err) {
        if ((err as { code?: string }).code !== '55006' || attempt === 20) throw err;
        await sleep(50 * attempt);
      }
    }
  } finally {
    await admin.end();
  }

  const url = withDatabase(base, name);
  const { db, pool } = createDb(url);
  // Dropped when the file is done, so a long watch session doesn't fill the container's disk.
  // FORCE ends any connection the file left open (a pg-boss pool, an app not closed).
  const close = async () => {
    await pool.end();
    const drop = new Client({ connectionString: withDatabase(base, 'postgres') });
    await drop.connect();
    try {
      await drop.query(`DROP DATABASE IF EXISTS "${name}" WITH (FORCE)`);
    } finally {
      await drop.end();
    }
  };
  return { db, url, close };
}

/** Registers a per-file database; call at the top of a test file. */
export function useTestDb(): () => TestDb {
  let testDb: TestDb | undefined;
  beforeAll(async () => {
    testDb = await createTestDb();
  });
  afterAll(() => testDb?.close());
  return () => {
    if (!testDb) throw new Error('useTestDb() is only available inside tests');
    return testDb;
  };
}
