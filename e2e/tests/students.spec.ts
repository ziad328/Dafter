import { expect, signIn, STAFF, test, openNav, choose } from './fixtures';

const CENTER = { ar: 'سنتر النور', en: 'Al-Nour Center' };
const SEC3 = { ar: 'الصف الثالث الثانوي', en: 'Secondary 3' };

test('assistant adds a student, finds them, and is warned about a reused phone', async ({
  page,
  lang,
  t,
}) => {
  // The dev database is not reset between runs, so this run's student has unique digits.
  const n = String(Math.floor(Math.random() * 1e8)).padStart(8, '0');
  const name = `فاطمة ${n}`;
  const phone = `010${n}`;

  await signIn(page, t, STAFF.assistant);
  await page.getByRole('button', { name: CENTER[lang] }).click();
  await openNav(page, t, t.nav.students);
  await page.getByRole('link', { name: t.students.new }).click();

  await page.getByLabel(t.students.nameAr, { exact: true }).fill(name);
  await page.getByLabel(t.students.phone, { exact: true }).fill(phone);
  await choose(page, t.students.gradeLevel, SEC3[lang]);
  await page.getByLabel(t.students.guardianPhone, { exact: true }).fill(`012${n}`);
  await page.getByRole('button', { name: t.students.create }).click();

  // A new student opens on their own page, ready to enroll.
  await expect(page).toHaveURL(/\/students\/[\w-]+$/);
  await expect(page.getByRole('heading', { name })).toBeVisible();
  // "فاطمه" (taa marbuta typed as haa) still finds "فاطمة".
  await page.goto('/students');
  await page.getByRole('searchbox', { name: t.students.search }).fill(`فاطمه ${n}`);
  await expect(page.getByRole('heading', { name })).toBeVisible();
  await expect(page.getByRole('main').getByRole('link')).toHaveCount(2); // "New student" + the one match

  await page.getByRole('link', { name: t.students.new }).click();
  await page.getByLabel(t.students.phone, { exact: true }).fill(phone);
  const warning = page.getByRole('status').filter({ hasText: t.students.duplicatePhone });
  await expect(warning.getByRole('link', { name })).toBeVisible();
});
