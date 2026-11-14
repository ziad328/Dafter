import { expect, signIn, STAFF, test, openNav, choose } from './fixtures';

const CENTER = { ar: 'سنتر النور', en: 'Al-Nour Center' };
const PHYSICS = { ar: 'الفيزياء', en: 'Physics' };
const SEC3 = { ar: 'الصف الثالث الثانوي', en: 'Secondary 3' };

test('owner enrolls a student and sends a link; the student activates and binds the phone', async ({
  page,
  browser,
  lang,
  t,
}) => {
  // The dev database is not reset between runs, so this run's records have unique digits.
  const n = String(Math.floor(Math.random() * 1e8)).padStart(8, '0');
  const name = `سارة ${n}`;
  const email = `s${n}@example.com`;

  await signIn(page, t, STAFF.owner);
  await page.getByRole('button', { name: CENTER[lang] }).click();

  // A group to enroll into (a fresh dev database has none).
  await openNav(page, t, t.nav.groups);
  await page.getByRole('link', { name: t.groups.new }).click();
  await choose(page, t.groups.subject, PHYSICS[lang]);
  await choose(page, t.groups.gradeLevel, SEC3[lang]);
  await choose(page, t.groups.teacher, 'منى حسن');
  await page.getByLabel(t.groups.start).fill('16:00');
  await page.getByLabel(t.groups.end).fill('17:30');
  await page.getByRole('button', { name: t.groups.create }).click();
  await expect(page).toHaveURL(/\/groups$/);

  await page.goto('/students/new');
  await page.getByLabel(t.students.nameAr, { exact: true }).fill(name);
  await choose(page, t.students.gradeLevel, SEC3[lang]);
  await page.getByLabel(t.students.guardianPhone, { exact: true }).fill(`012${n}`);
  await page.getByRole('button', { name: t.students.create }).click();
  await expect(page).toHaveURL(/\/students\/[\w-]+$/);
  await expect(page.getByRole('heading', { name })).toBeVisible();

  // Enroll with a discount.
  await choose(page, t.enrollments.group, { index: 0 });
  await page.getByLabel(new RegExp(t.enrollments.discount.replace('%', ''))).fill('10');
  await page.getByRole('button', { name: t.enrollments.add }).click();
  await expect(page.getByRole('button', { name: t.enrollments.leave })).toBeVisible();

  await expect(page.getByText(t.studentApp.staff.notActivated)).toBeVisible();
  await page.getByRole('button', { name: t.studentApp.staff.invite }).click();
  const link = (await page.getByTestId('invite-link').textContent())!;

  // The student, on their own phone.
  const phone = await browser.newContext({
    viewport: { width: 375, height: 812 },
    hasTouch: true,
    isMobile: true,
  });
  await phone.addInitScript((l) => {
    localStorage.setItem('dafter.locale', l);
    // Stands in for the installed PWA (dev only); pwa.spec.ts covers the browser-tab gate.
    localStorage.setItem('dafter.devInstalled', '1');
  }, lang);
  const student = await phone.newPage();
  await student.goto(link);
  await student.getByLabel(t.studentApp.email).fill(email);
  await student.getByRole('button', { name: t.studentApp.sendCode }).click();
  await expect(student.getByText(email)).toBeVisible();
  const mail = await student.request.get(`/api/v1/dev/mail?to=${encodeURIComponent(email)}`);
  const code = ((await mail.json()) as { text: string }).text.match(/\d{6}/)![0];
  await student.getByLabel(t.studentApp.code).fill(code);
  await student.getByRole('button', { name: t.studentApp.verify }).click();
  await expect(student).toHaveURL(/\/s$/);
  await expect(student.getByText(t.studentApp.bound)).toBeVisible();
  await phone.close();

  // Back at the center: the phone shows as bound, and the assistant flow can reset it.
  await page.reload();
  await expect(page.getByText(t.studentApp.staff.bound)).toBeVisible();
  await page.getByRole('button', { name: t.studentApp.staff.reset }).click();
  await page.getByRole('button', { name: t.studentApp.staff.resetConfirm }).click();
  await expect(page.getByText(t.studentApp.staff.noPhone)).toBeVisible();
});
