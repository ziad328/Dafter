import { expect, signIn, STAFF, test } from './fixtures';

const CENTER = { ar: 'سنتر النور', en: 'Al-Nour Center' };
const PRIVATE = { ar: 'دروس منى حسن', en: 'Mona Hassan Lessons' };

// The teacher is a teacher at Al-Nour and owns her private lessons.
test('staff signs in and switches workspace', async ({ page, lang, t }) => {
  await signIn(page, t, STAFF.teacher);
  await expect(page.locator('html')).toHaveAttribute('dir', lang === 'ar' ? 'rtl' : 'ltr');

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
});
