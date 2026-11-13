import { existsSync } from 'node:fs';
import { createApp } from './app.js';
import { Clock } from './clock.js';
import { DB } from './db.js';
import { startWorker } from './worker.js';

// Local dev reads the repo-root .env; hosts (Render) inject real env vars instead.
const envFile = '../../.env';
if (existsSync(envFile)) process.loadEnvFile(envFile);

async function bootstrap() {
  const app = await createApp();
  if (process.env.RUN_WORKER === 'true') {
    const boss = await startWorker(app.get(DB), app.get(Clock), process.env.DATABASE_URL!);
    app
      .getHttpAdapter()
      .getInstance()
      .addHook('onClose', () => boss.stop());
  }
  await app.listen({ port: Number(process.env.PORT ?? 3000), host: '0.0.0.0' });
}

void bootstrap();
