import { Logger } from '@nestjs/common';

type Env = Record<string, string | undefined>;

/**
 * Refuses to start with a switch that would expose secrets in production: DEV_MAIL_INBOX lets
 * anyone read any student's login code. Runs in createApp, so every entry (server, Vercel,
 * tests) is checked.
 */
export function checkEnv(env: Env = process.env) {
  if (env.NODE_ENV !== 'production') return;
  if (env.DEV_MAIL_INBOX === '1')
    throw new Error('DEV_MAIL_INBOX must not be set in production: it shows login codes to anyone');
  if (env.DEV_FAKE_PHONE === '1' && env.DEMO_DEPLOY !== '1')
    new Logger('Env').warn('DEV_FAKE_PHONE is ignored in production without DEMO_DEPLOY=1');
}

/**
 * The fake phone page (each workspace's sent messages, full phones): always in development, in
 * production only on the demo deploy, which says so with DEMO_DEPLOY=1. Read per request,
 * because main.ts loads .env after the modules are imported.
 */
export const fakePhoneOn = (env: Env = process.env) =>
  env.DEV_FAKE_PHONE === '1' && (env.NODE_ENV !== 'production' || env.DEMO_DEPLOY === '1');
