import { expect, test } from '@playwright/test';
// Direct JSON imports: Node ESM needs the attribute, and @dafter/i18n's index only works under Vite.
import ar from '../../packages/i18n/locales/ar/common.json' with { type: 'json' };
import en from '../../packages/i18n/locales/en/common.json' with { type: 'json' };

// Seeded by `pnpm db:reset`: the teacher is a teacher at Al-Nour and owns her private lessons.
const TEACHER = { login: '01000000002', password: 'dafter-dev-123' };
const CENTER = { ar: 'سنتر النور', en: 'Al-Nour Center' };
const PRIVATE = { ar: 'دروس منى حسن', en: 'Mona Hassan Lessons' };

test('staff signs in and switches workspace', async ({ page }, testInfo) => {
  const lang = testInfo.project.metadata.locale as 'ar' | 'en';
  const t = { ar, en }[lang];

  // Unexpected browser errors fail the test. Signed out, POST /auth/refresh returns 401 by design.
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
  await page.goto('/login');
  await expect(page.locator('html')).toHaveAttribute('dir', lang === 'ar' ? 'rtl' : 'ltr');

  await page.getByLabel(t.auth.login.login).fill(TEACHER.login);
  await page.getByLabel(t.auth.login.password).fill(TEACHER.password);
  await page.getByRole('button', { name: t.auth.login.submit }).click();

  // No workspace chosen yet, so home sends her to the list.
  await expect(page).toHaveURL(/\/workspaces$/);
  await page.getByRole('button', { name: CENTER[lang] }).click();
  await expect(page.getByRole('heading', { level: 1, name: CENTER[lang] })).toBeVisible();
  await expect(page.getByText(t.roles.teacher, { exact: true })).toBeVisible();

  await page.getByRole('link', { name: t.home.switch }).click();
  await page.getByRole('button', { name: PRIVATE[lang] }).click();
  await expect(page.getByRole('heading', { level: 1, name: PRIVATE[lang] })).toBeVisible();
  await expect(page.getByText(t.roles.owner, { exact: true })).toBeVisible();

  // The session (refresh cookie) and the chosen workspace survive a reload.
  await page.reload();
  await expect(page.getByRole('heading', { level: 1, name: PRIVATE[lang] })).toBeVisible();

  const overflow = await page.evaluate(
    () => document.documentElement.scrollWidth > document.documentElement.clientWidth,
  );
  expect(overflow, 'horizontal scroll at 375 px').toBe(false);
  expect(problems).toEqual([]);
});
