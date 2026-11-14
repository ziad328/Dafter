import { Client } from 'pg';
import { runMigrations } from '../migrate.js';
import { seed } from '../seed.js';
import { databaseUrl } from './env.js';

const LOCAL_HOSTS = new Set(['localhost', '127.0.0.1', '::1', '[::1]']);

export async function main() {
  const url = databaseUrl();
  // Drops every table: refuse anything that is not a local database.
  const host = new URL(url).hostname;
  if (!LOCAL_HOSTS.has(host)) throw new Error(`Refusing to reset a non-local database (${host})`);

  const client = new Client({ connectionString: url });
  await client.connect();
  try {
    await client.query(
      'DROP SCHEMA IF EXISTS drizzle CASCADE; DROP SCHEMA public CASCADE; CREATE SCHEMA public;',
    );
  } finally {
    await client.end();
  }

  await runMigrations(url);
  await seed(url);
  console.log('Database reset, migrated and seeded');
}

// Run by tsx from package.json; tests import main() instead.
/* v8 ignore next 4 */
if (require.main === module)
  main().catch((err: unknown) => {
    console.error(err);
    process.exit(1);
  });
