import {
  expect,
  signIn,
  STAFF,
  test,
  openNav,
  choose,
  enterWorkspace,
  GROUP_CONFLICT,
  submitGroup,
} from './fixtures';

test.use({ expectedErrors: GROUP_CONFLICT });

const CENTER = { ar: 'سنتر النور', en: 'Al-Nour Center' };
const PHYSICS = { ar: 'الفيزياء', en: 'Physics' };
const SEC3 = { ar: 'الصف الثالث الثانوي', en: 'Secondary 3' };
// Rows show each slot's day and start (audit 3 G2).
const SLOT = { ar: /4:00\sم/, en: /4:00\sPM/ };

test('owner creates a group for a teacher', async ({ page, lang, t }) => {
  // The dev database is not reset between runs, so find this run's group by its capacity.
  const capacity = String(100 + Math.floor(Math.random() * 900));

  await signIn(page, t, STAFF.owner);
  await enterWorkspace(page, t, CENTER[lang]);
  await openNav(page, t, t.nav.groups);
  await page.getByRole('link', { name: t.groups.new }).click();

  await choose(page, t.groups.subject, PHYSICS[lang]);
  await choose(page, t.groups.gradeLevel, SEC3[lang]);
  await choose(page, t.groups.teacher, 'منى حسن');
  // Optional fields sit under «تفاصيل أكثر».
  await page.getByText(t.students.more).click();
  await page.getByLabel(new RegExp(t.groups.capacity)).fill(capacity);
  await page.getByLabel(t.groups.start).fill('16:00');
  await page.getByLabel(t.groups.end).fill('17:30');
  await submitGroup(page, t);

  // A new group opens on its own page (audit 3 G1); its header names it.
  await expect(page).toHaveURL(/\/groups\/[0-9a-f-]{36}$/);
  const header = page.getByRole('main').locator('header').first();
  await expect(header.getByRole('heading', { name: new RegExp(PHYSICS[lang]) })).toBeVisible();
  await expect(header).toContainText(SEC3[lang]);
  await expect(header).toContainText('منى حسن');
  // Slots read in 12-hour time.
  await expect(header).toContainText(SLOT[lang]);

  // Editing opens with the saved subject and grade, even on a fresh load (lists arrive late).
  await page.getByRole('link', { name: t.groups.editShort }).click();
  await page.reload();
  await expect(page.getByRole('combobox', { name: t.groups.subject, exact: true })).toContainText(
    PHYSICS[lang],
  );
  await expect(
    page.getByRole('combobox', { name: t.groups.gradeLevel, exact: true }),
  ).toContainText(SEC3[lang]);
});
