import { expect, PASSWORD, signIn, STAFF, test, workspaceChip } from './fixtures';

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
  // Her own lessons read as an independent teacher's, not «مالك» (audit 3 A8).
  await expect(workspaceChip(page, t)).toContainText(t.workspaces.create.independent);

  // The session (refresh cookie) and the chosen workspace survive a reload.
  await page.reload();
  await expect(workspaceChip(page, t)).toContainText(PRIVATE[lang]);
});

// A brand-new account has no workspace: the welcome screen asks center or teacher (audit 3 A6, A7).
test('a new account picks independent teacher on the welcome screen', async ({ page, t }) => {
  const n = String(Date.now()).slice(-8);
  await page.goto('/register');
  await page.getByLabel(t.auth.register.name).fill(`سامي ${n}`);
  await page.getByLabel(t.auth.register.phone).fill(`011${n}`);
  await page.getByLabel(t.auth.register.password).fill(PASSWORD);
  await page.getByRole('button', { name: t.auth.register.submit }).click();

  await expect(page).toHaveURL(/\/welcome$/);
  await expect(page.getByRole('button', { name: t.shell.logout })).toBeVisible();
  await page.getByText(t.workspaces.create.independent, { exact: true }).click();
  await page.getByLabel(t.workspaces.create.teacherName).fill(`دروس سامي ${n}`);
  await page.getByRole('button', { name: t.workspaces.create.submit }).click();
  await expect(workspaceChip(page, t)).toContainText(`دروس سامي ${n}`);
  await expect(workspaceChip(page, t)).toContainText(t.workspaces.create.independent);
});
