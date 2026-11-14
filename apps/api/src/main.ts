import { existsSync } from 'node:fs';
import { Logger } from '@nestjs/common';
import { runMigrations } from '@dafter/db';
import { createApp } from './app.js';
import { Clock } from './clock.js';
import { DB } from './db.js';
import { startWorker } from './worker.js';

// Local dev reads the repo-root .env; hosts inject real env vars instead.
const envFile = '../../.env';
if (existsSync(envFile)) process.loadEnvFile(envFile);

export async function bootstrap() {
  const directUrl = process.env.DATABASE_URL_UNPOOLED || process.env.DATABASE_URL!;
  // Long-running hosts migrate on every start; already-applied migrations are skipped. Vercel
  // uses src/vercel.ts instead, with no worker and no migrations at boot.
  if (process.env.MIGRATE_ON_START === '1') {
    await runMigrations(directUrl);
    new Logger('Migrations').log('Applied');
  }
  const app = await createApp();
  if (process.env.RUN_WORKER === 'true') {
    // pg-boss on the direct connection (Neon's pooler is transaction mode); the API uses the pool.
    const boss = await startWorker(app.get(DB), app.get(Clock), directUrl);
    app
      .getHttpAdapter()
      .getInstance()
      .addHook('onClose', () => boss.stop());
  }
  await app.listen({ port: Number(process.env.PORT ?? 3000), host: '0.0.0.0' });
  return app;
}

// The entry point (node dist/main.js); tests import bootstrap() instead.
/* v8 ignore next */
if (require.main === module) void bootstrap();
