import { existsSync } from 'node:fs';
import { Logger } from '@nestjs/common';
import { PgBoss } from 'pg-boss';
import { createDb, type Db } from '@dafter/db';
import { Clock } from './clock.js';
import { GENERATE_SESSIONS, generateAllSessions } from './jobs/generate-sessions.js';
import { chargeAllWorkspaces, MONTHLY_CHARGES } from './jobs/monthly-charges.js';

/** Starts pg-boss and registers the jobs. Returns the instance so the caller can stop it. */
export async function startWorker(db: Db, clock: Clock, connectionString: string) {
  const log = new Logger('Worker');
  const boss = new PgBoss(connectionString);
  boss.on('error', (err) => log.error(err));
  await boss.start();

  await boss.createQueue(GENERATE_SESSIONS);
  await boss.work(GENERATE_SESSIONS, async () => {
    const created = await generateAllSessions(db, clock);
    log.log(`Generated ${created} sessions`);
  });
  // Daily top-up, plus one run now so a fresh deploy or a long pause starts with 4 weeks.
  await boss.schedule(GENERATE_SESSIONS, '0 2 * * *', null, { tz: 'Africa/Cairo' });
  await boss.send(GENERATE_SESSIONS);

  await boss.createQueue(MONTHLY_CHARGES);
  await boss.work(MONTHLY_CHARGES, async () => {
    const created = await chargeAllWorkspaces(db, clock);
    log.log(`Created ${created} monthly charges`);
  });
  // Daily, so a new month is billed on its first day (and a missed day catches up).
  await boss.schedule(MONTHLY_CHARGES, '0 3 * * *', null, { tz: 'Africa/Cairo' });
  await boss.send(MONTHLY_CHARGES);

  log.log('Worker started');
  return boss;
}

if (require.main === module) {
  if (existsSync('../../.env')) process.loadEnvFile('../../.env');
  const url = process.env.DATABASE_URL;
  if (!url) throw new Error('DATABASE_URL is not set');
  void startWorker(createDb(url).db, new Clock(), url);
}
