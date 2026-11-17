import { existsSync } from 'node:fs';
import { defineConfig } from '@playwright/test';

// The same repo-root .env as the API, so tests can call dev-only endpoints (CRON_SECRET).
if (existsSync('../.env')) process.loadEnvFile('../.env');

const CI = !!process.env.CI;
// Set to the live demo (pnpm e2e:live) to run the read-only smoke test there instead of locally.
const LIVE = process.env.E2E_BASE_URL;

// Smoke set: every flow runs in Arabic (RTL) and English on a phone-sized screen.
const phone = { viewport: { width: 375, height: 812 }, hasTouch: true, isMobile: true };

export default defineConfig({
  testDir: 'tests',
  globalSetup: './global-setup.ts',
  fullyParallel: true,
  // One dev server (Vite + API + PostgreSQL) serves every worker; more than 6 at once makes the
  // first sign-ins of a cold run time out. GitHub's 4-core runner also runs that server, so it
  // gets 2 workers and twice the test time (the long flows timed out at 30 s there).
  workers: CI ? 2 : 6,
  timeout: CI ? 60_000 : 30_000,
  forbidOnly: CI,
  retries: CI ? 1 : 0,
  reporter: CI ? [['list'], ['html', { open: 'never' }]] : 'list',
  use: {
    baseURL: LIVE ?? 'http://localhost:5173',
    // The installed Chrome (GitHub's Ubuntu runners ship it), so no browser download.
    channel: 'chrome',
    trace: 'retain-on-failure',
  },
  projects: [
    { name: 'ar', use: { ...phone, locale: 'ar-EG' }, metadata: { locale: 'ar' } },
    { name: 'en', use: { ...phone, locale: 'en-US' }, metadata: { locale: 'en' } },
  ],
  // Reuses a running `pnpm dev`; otherwise starts it (needs a migrated, seeded database).
  webServer: LIVE
    ? undefined
    : {
        command: 'pnpm dev',
        cwd: '..',
        // Through the Vite proxy, so it is ready only when both web and API are up.
        url: 'http://localhost:5173/health',
        reuseExistingServer: !CI,
        timeout: 180_000,
      },
});
