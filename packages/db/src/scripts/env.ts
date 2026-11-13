import { existsSync } from 'node:fs';
import { join } from 'node:path';

// Scripts run from packages/db; local dev keeps .env at the repo root.
const envFile = join(__dirname, '..', '..', '..', '..', '.env');
if (existsSync(envFile)) process.loadEnvFile(envFile);

export function databaseUrl(): string {
  const url = process.env.DATABASE_URL;
  if (!url) throw new Error('DATABASE_URL is not set (copy .env.example to .env)');
  return url;
}
