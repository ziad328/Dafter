import { Controller, Get, Inject, Logger, Query } from '@nestjs/common';
import { AppError } from '../errors.js';

/** Port for outgoing email. Development and tests use ConsoleMailer; production uses BrevoMailer. */
export abstract class Mailer {
  abstract send(to: string, text: string, subject?: string): Promise<void>;
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
 * Production (MAIL_PROVIDER=brevo): Brevo's transactional email HTTP API. The free tier sends from
 * one verified sender address (MAIL_FROM), with no domain needed.
 */
export class BrevoMailer extends Mailer {
  constructor(
    private readonly apiKey: string,
    private readonly from: string,
    private readonly fetchFn: typeof fetch = fetch,
  ) {
    super();
  }

  async send(to: string, text: string, subject = 'رمز الدخول إلى دفتر · Your Dafter code') {
    const res = await this.fetchFn('https://api.brevo.com/v3/smtp/email', {
      method: 'POST',
      headers: { 'api-key': this.apiKey, 'content-type': 'application/json' },
      body: JSON.stringify({
        sender: { email: this.from, name: 'دفتر Dafter' },
        to: [{ email: to }],
        subject,
        textContent: text,
      }),
      signal: AbortSignal.timeout(10_000),
    });
    // The body may echo the recipient, never the key; enough to debug from Render's logs.
    if (!res.ok) throw new Error(`Brevo ${res.status}: ${(await res.text()).slice(0, 200)}`);
  }
}

/** Brevo when configured, else the console (development, tests, or a deploy without email). */
export function mailerFromEnv(env = process.env): Mailer {
  if (env.MAIL_PROVIDER !== 'brevo') return new ConsoleMailer();
  if (!env.BREVO_API_KEY || !env.MAIL_FROM)
    throw new Error('MAIL_PROVIDER=brevo needs BREVO_API_KEY and MAIL_FROM');
  return new BrevoMailer(env.BREVO_API_KEY, env.MAIL_FROM);
}

/**
 * Development only (DEV_MAIL_INBOX=1): lets Playwright read a login code. The API refuses to
 * start with it in production (env-check.ts). Checked per request, because main.ts loads .env after the modules are imported.
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
