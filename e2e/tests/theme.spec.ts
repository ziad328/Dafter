import { enterWorkspace, expect, openNav, signIn, STAFF, test } from './fixtures';

const CENTER = { ar: 'سنتر النور', en: 'Al-Nour Center' };

test('staff switch to dark mode from "More", and it stays after a reload', async ({
  page,
  lang,
  t,
}) => {
  await page.emulateMedia({ colorScheme: 'light' });
  await signIn(page, t, STAFF.owner);
  await enterWorkspace(page, t, CENTER[lang]);
  await openNav(page, t, t.nav.more);
  const html = page.locator('html');
  await expect(html).not.toHaveClass(/dark/);
  await page.getByRole('button', { name: t.shell.darkMode }).click();
  await expect(html).toHaveClass(/dark/);
  await page.reload();
  await expect(html).toHaveClass(/dark/);
  await page.getByRole('button', { name: t.shell.lightMode }).click();
  await expect(html).not.toHaveClass(/dark/);
});

test('signed out, the app follows the phone set to dark', async ({ page, t }) => {
  await page.emulateMedia({ colorScheme: 'dark' });
  await page.goto('/login');
  await expect(page.locator('html')).toHaveClass(/dark/);
  await expect(page.getByRole('button', { name: t.shell.lightMode })).toBeVisible();
});
