import { Client } from 'pg';
import { expect, it } from 'vitest';
import { createTestDb } from './test-db.js';

it('drops the cloned database on close, even with a connection still open', async () => {
  const t = await createTestDb();
  const name = new URL(t.url).pathname.slice(1);
  const left = new Client({ connectionString: t.url });
  await left.connect();
  left.on('error', () => {}); // FORCE terminates it
  await t.close();
  const admin = new Client({ connectionString: t.url.replace(`/${name}`, '/postgres') });
  await admin.connect();
  const { rowCount } = await admin.query('select 1 from pg_database where datname = $1', [name]);
  await admin.end();
  expect(rowCount).toBe(0);
});
