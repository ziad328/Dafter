import { expect, signIn, STAFF, test, workspaceChip } from './fixtures';

const CENTER = { ar: 'سنتر النور', en: 'Al-Nour Center' };
const PRIVATE = { ar: 'دروس منى حسن', en: 'Mona Hassan Lessons' };

// The teacher is a teacher at Al-Nour and owns her private lessons.
test('staff signs in and switches workspace', async ({ page, lang, t }) => {
  await signIn(page, t, STAFF.teacher);
  await expect(page.locator('html')).toHaveAttribute('dir', lang === 'ar' ? 'rtl' : 'ltr');

  // No workspace chosen yet, so home sends her to the list.
  await expect(page).toHaveURL(/\/workspaces$/);
  await page.getByRole('button', { name: CENTER[lang] }).click();
  await expect(workspaceChip(page, t)).toContainText(CENTER[lang]);
  await expect(workspaceChip(page, t)).toContainText(t.roles.teacher);

  await workspaceChip(page, t).click();
  await page.getByRole('button', { name: PRIVATE[lang] }).click();
  await expect(workspaceChip(page, t)).toContainText(PRIVATE[lang]);
  await expect(workspaceChip(page, t)).toContainText(t.roles.owner);

  // The session (refresh cookie) and the chosen workspace survive a reload.
  await page.reload();
  await expect(workspaceChip(page, t)).toContainText(PRIVATE[lang]);
});
