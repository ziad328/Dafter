import { defineConfig } from '@playwright/test';

const CI = !!process.env.CI;
// Set to the live demo (pnpm e2e:live) to run the read-only smoke test there instead of locally.
const LIVE = process.env.E2E_BASE_URL;

// Smoke set: every flow runs in Arabic (RTL) and English on a phone-sized screen.
const phone = { viewport: { width: 375, height: 812 }, hasTouch: true, isMobile: true };

export default defineConfig({
  testDir: 'tests',
  fullyParallel: true,
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
