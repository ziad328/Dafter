import { test as base, expect, type Page } from '@playwright/test';
// Direct JSON imports: Node ESM needs the attribute, and @dafter/i18n's index only works under Vite.
import ar from '../../packages/i18n/locales/ar/common.json' with { type: 'json' };
import en from '../../packages/i18n/locales/en/common.json' with { type: 'json' };

/** Seeded by `pnpm db:reset`; every staff user has the dev password. */
export const STAFF = { owner: '01000000001', teacher: '01000000002', assistant: '01000000003' };
export const PASSWORD = 'dafter-dev-123';

type Lang = 'ar' | 'en';

/**
 * `lang` and `t` follow the project (ar or en). Every test fails on an uncaught page error, a
 * console error or a failed request; signed out, POST /auth/refresh returns 401 by design.
 */
export const test = base.extend<{ lang: Lang; t: typeof ar }>({
  // Playwright requires an object pattern as the first fixture argument.
  // eslint-disable-next-line no-empty-pattern
  lang: async ({}, use, testInfo) => use(testInfo.project.metadata.locale as Lang),
  t: async ({ lang }, use) => use({ ar, en }[lang]),
  page: async ({ page, lang }, use) => {
    const problems: string[] = [];
    page.on('pageerror', (e) => problems.push(e.message));
    page.on('console', (m) => {
      if (m.type() === 'error' && !m.text().includes('401')) problems.push(m.text());
    });
    page.on('response', (r) => {
      if (r.status() >= 400 && !(r.status() === 401 && r.url().endsWith('/auth/refresh')))
        problems.push(`${r.status()} ${r.url()}`);
    });
    await page.addInitScript((l) => localStorage.setItem('dafter.locale', l), lang);
    await use(page);
    const overflow = await page.evaluate(
      () => document.documentElement.scrollWidth > document.documentElement.clientWidth,
    );
    expect(overflow, 'horizontal scroll at 375 px').toBe(false);
    expect(problems).toEqual([]);
  },
});

export { expect };

export async function signIn(page: Page, t: typeof ar, login: string) {
  await page.goto('/login');
  await page.getByLabel(t.auth.login.login).fill(login);
  await page.getByLabel(t.auth.login.password).fill(PASSWORD);
  await page.getByRole('button', { name: t.auth.login.submit }).click();
}

/**
 * Opens a staff screen from the navigation: a bottom tab on a phone, or through "More" for the
 * screens that live there (messages, staff, the fake phone).
 */
export async function openNav(page: Page, t: typeof ar, label: string) {
  const nav = page.getByRole('navigation', { name: t.nav.label });
  // The bar renders once the workspace has loaded; wait for it before asking what it holds.
  await nav.getByRole('link', { name: t.nav.more, exact: true }).waitFor();
  const link = nav.getByRole('link', { name: label, exact: true });
  if (await link.count()) return link.click();
  await nav.getByRole('link', { name: t.nav.more, exact: true }).click();
  await page.getByRole('main').getByRole('link', { name: label, exact: true }).click();
}

/** The header's workspace chip: its accessible name is "Switch workspace"; it shows the name. */
export const workspaceChip = (page: Page, t: typeof ar) =>
  page.getByRole('link', { name: t.nav.switchWorkspace });
