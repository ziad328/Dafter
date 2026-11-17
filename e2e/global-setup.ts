import pg from 'pg';

/**
 * Rate-limit counters live in PostgreSQL and outlast `pnpm dev`, so back-to-back local runs would
 * hit the per-IP limits (password resets, student codes) from 127.0.0.1. Start each run from zero.
 * CI starts from a fresh database; the live smoke test (E2E_BASE_URL) never touches the database.
 */
export default async function globalSetup() {
  if (process.env.E2E_BASE_URL || !process.env.DATABASE_URL) return;
  const client = new pg.Client({ connectionString: process.env.DATABASE_URL });
  await client.connect();
  try {
    await client.query('DELETE FROM rate_limits');
  } finally {
    await client.end();
  }
}
