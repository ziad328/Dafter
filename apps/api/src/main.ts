import { existsSync } from 'node:fs';
import { createApp } from './app.js';
import { startWorker } from './worker.js';

// Local dev reads the repo-root .env; hosts (Render) inject real env vars instead.
const envFile = '../../.env';
if (existsSync(envFile)) process.loadEnvFile(envFile);

async function bootstrap() {
  const app = await createApp();
  await app.listen({ port: Number(process.env.PORT ?? 3000), host: '0.0.0.0' });
  if (process.env.RUN_WORKER === 'true') await startWorker();
}

void bootstrap();
