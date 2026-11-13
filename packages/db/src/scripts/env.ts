import { existsSync } from 'node:fs';
import { join } from 'node:path';

// Scripts run from packages/db; local dev keeps .env at the repo root. Variables already set (by
// the host, or `--env-file=.env.neon`) win, because loadEnvFile never overrides.
const envFile = join(__dirname, '..', '..', '..', '..', '.env');
if (existsSync(envFile)) process.loadEnvFile(envFile);

/** Scripts (migrate, seed) use Neon's direct connection when set: DDL and long jobs skip the pooler. */
export function databaseUrl(): string {
  const url = process.env.DATABASE_URL_UNPOOLED || process.env.DATABASE_URL;
  if (!url) throw new Error('DATABASE_URL is not set (copy .env.example to .env)');
  return url;
}
