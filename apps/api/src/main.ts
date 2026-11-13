import { existsSync } from 'node:fs';
import { Logger } from '@nestjs/common';
import { runMigrations } from '@dafter/db';
import { createApp } from './app.js';
import { Clock } from './clock.js';
import { DB } from './db.js';
import { startWorker } from './worker.js';

// Local dev reads the repo-root .env; hosts (Render) inject real env vars instead.
const envFile = '../../.env';
if (existsSync(envFile)) process.loadEnvFile(envFile);

async function bootstrap() {
  const directUrl = process.env.DATABASE_URL_UNPOOLED || process.env.DATABASE_URL!;
  // Deploys (Render) migrate on every start; already-applied migrations are skipped.
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
}

void bootstrap();
