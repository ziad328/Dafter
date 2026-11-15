import { timingSafeEqual } from 'node:crypto';
import { Controller, Get, Headers, Inject, Module, Query } from '@nestjs/common';
import type { Db } from '@dafter/db';
import { Clock } from '../clock.js';
import { DB } from '../db.js';
import { AppError } from '../errors.js';
import { OutboxSender } from '../messages/outbox-sender.js';
import { generateAllSessions } from './generate-sessions.js';
import { chargeAllWorkspaces, remindAllWorkspaces } from './monthly-charges.js';

const matches = (given: string, secret: string) => {
  const a = Buffer.from(given);
  const b = Buffer.from(secret);
  return a.length === b.length && timingSafeEqual(a, b);
};

/**
 * Background work for serverless hosts (Vercel), where no pg-boss worker runs: Vercel's cron
 * calls it daily at 08:00 Cairo with `daily=1` (send what quiet hours held, generate sessions,
 * monthly charges), and an optional hourly external cron retries failed sends. New messages leave
 * right after their write (OutboxSender.afterCommit). Every job is safe to repeat. Off unless CRON_SECRET is set.
 */
@Controller('internal/tick')
export class TickController {
  constructor(
    @Inject(DB) private readonly db: Db,
    @Inject(Clock) private readonly clock: Clock,
    @Inject(OutboxSender) private readonly outbox: OutboxSender,
  ) {}

  @Get()
  async tick(@Headers('authorization') auth = '', @Query('daily') daily?: string) {
    const secret = process.env.CRON_SECRET;
    if (!secret || !matches(auth, `Bearer ${secret}`)) throw new AppError('UNAUTHENTICATED');
    if (daily !== '1') return { sent: await this.outbox.sendAll() };
    // The daily jobs first, so the reminders they queue go out in this same call.
    const sessions = await generateAllSessions(this.db, this.clock);
    const charges = await chargeAllWorkspaces(this.db, this.clock);
    const reminders = await remindAllWorkspaces(this.db, this.clock);
    return { sent: await this.outbox.sendAll(), sessions, charges, reminders };
  }
}

@Module({ controllers: [TickController] })
export class JobsModule {}
