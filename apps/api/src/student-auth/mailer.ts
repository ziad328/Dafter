import { Controller, Get, Inject, Logger, Query } from '@nestjs/common';
import { AppError } from '../errors.js';

/** Port for outgoing email. Development and tests use ConsoleMailer; Day 17 adds a real provider. */
export abstract class Mailer {
  abstract send(to: string, text: string): Promise<void>;
}

export class ConsoleMailer extends Mailer {
  private readonly logger = new Logger('Mail');
  readonly inbox: { to: string; text: string }[] = [];

  async send(to: string, text: string) {
    // Never log codes in production (no provider there until Day 17).
    if (process.env.NODE_ENV !== 'production') this.logger.log(`to=${to} ${text}`);
    this.inbox.push({ to, text });
    if (this.inbox.length > 100) this.inbox.shift();
  }

  /** The newest message to `to`, if any. */
  last(to: string) {
    return this.inbox.findLast((m) => m.to === to.toLowerCase());
  }
}

/**
 * Development only (DEV_MAIL_INBOX=1): lets Playwright read a login code. Never set in
 * production. Checked per request, because main.ts loads .env after the modules are imported.
 */
@Controller('dev/mail')
export class DevMailController {
  constructor(@Inject(Mailer) private readonly mailer: Mailer) {}

  @Get()
  last(@Query('to') to = '') {
    const msg =
      process.env.DEV_MAIL_INBOX === '1' && this.mailer instanceof ConsoleMailer
        ? this.mailer.last(to)
        : undefined;
    if (!msg) throw new AppError('NOT_FOUND');
    return msg;
  }
}
