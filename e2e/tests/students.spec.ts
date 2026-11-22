import {
  choose,
  enterWorkspace,
  expect,
  freshCenter,
  openNav,
  signIn,
  STAFF,
  test,
} from './fixtures';

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
  await enterWorkspace(page, t, CENTER[lang]);
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
  // The new student is on the unfiltered list too: wait for the search's own answer (after the
  // 300 ms debounce), or the count below races it under load.
  const searched = page.waitForResponse(
    (r) => r.url().includes('/api/v1/students?') && r.url().includes('q='),
  );
  await page.getByRole('searchbox', { name: t.students.search }).fill(`فاطمه ${n}`);
  await searched;
  await expect(page.getByRole('heading', { name })).toBeVisible();
  await expect(page.getByRole('main').getByRole('link')).toHaveCount(2); // "New student" + the one match

  await page.getByRole('link', { name: t.students.new }).click();
  await page.getByLabel(t.students.phone, { exact: true }).fill(phone);
  const warning = page.getByRole('status').filter({ hasText: t.students.duplicatePhone });
  await expect(warning.getByRole('link', { name })).toBeVisible();
});

test('owner registers a student straight into a group, with a discount', async ({
  page,
  request,
  lang,
  t,
}) => {
  const c = await freshCenter(request, 'سنتر التسجيل');
  const { get, post } = c.api;
  const [subject] = await get('subjects');
  const grades = (await get('grade-levels')) as { id: string; nameAr: string; nameEn: string }[];
  const grade = grades.at(-1)!;
  await post('groups', {
    subjectId: subject.id,
    gradeLevelId: grade.id,
    slots: [{ weekday: 3, startTime: '16:00', endTime: '17:30' }],
  });
  const gradeName = lang === 'en' ? grade.nameEn : grade.nameAr;
  const n = String(Math.floor(Math.random() * 1e8)).padStart(8, '0');
  const name = `حسن ${n}`;

  await signIn(page, t, STAFF.owner);
  await enterWorkspace(page, t, c.name);
  await page.goto('/students/new');
  await page.getByLabel(t.students.nameAr, { exact: true }).fill(name);
  // Picking the group fills the grade.
  await choose(page, `${t.enrollments.group} ${t.form.optional}`, gradeName);
  await expect(
    page.getByRole('combobox', { name: t.students.gradeLevel, exact: true }),
  ).toContainText(gradeName);
  await page.getByLabel(`${t.enrollments.discount} ${t.form.optional}`).fill('10');
  await page.getByLabel(t.students.guardianPhone, { exact: true }).fill(`012${n}`);
  await page.getByRole('button', { name: t.students.create }).click();

  await expect(page.getByRole('heading', { name })).toBeVisible();
  await expect(page.getByText(t.enrollments.discountShort.replace('{pct}', '10'))).toBeVisible();
});
