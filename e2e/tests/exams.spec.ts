import { expect, ownerApi, signIn, STAFF, test, enterWorkspace } from './fixtures';

const CENTER = { ar: 'سنتر النور', en: 'Al-Nour Center' };

test('a teacher grades an exam and sends it to parents; the student sees the grade', async ({
  page,
  browser,
  request,
  lang,
  t,
}) => {
  // Two browsers and an email round trip, like the student-app flow.
  test.setTimeout(60_000);
  const api = await ownerApi(request, CENTER.ar);
  const n = String(Math.floor(Math.random() * 1e8)).padStart(8, '0');
  const [subject] = await api.get('subjects');
  const [grade] = await api.get('grade-levels');
  const group = await api.post('groups', {
    subjectId: subject.id,
    gradeLevelId: grade.id,
    label: `امتحانات ${n}`,
    slots: [{ weekday: 6, startTime: '16:00', endTime: '17:30' }],
  });
  const student = async (name: string, phone: string) => {
    const s = await api.post('students', {
      nameAr: name,
      gradeLevelId: grade.id,
      guardian: { phone, relation: 'mother', preferredLocale: lang, whatsappOptIn: false },
    });
    await api.post(`students/${s.id}/enrollments`, { groupId: group.id });
    return s.id as string;
  };
  const nour = `نور ${n}`;
  const yousef = `يوسف ${n}`;
  const nourId = await student(nour, `015${n}`);
  await student(yousef, `015${String(Number(n) + 1).padStart(8, '0')}`);

  await signIn(page, t, STAFF.owner);
  await enterWorkspace(page, t, CENTER[lang]);
  await page.goto(`/groups/${group.id}/exams`);
  await expect(page.getByText(t.exams.empty)).toBeVisible();
  await page.getByLabel(t.exams.examTitle).fill(`شهر ${n}`);
  await page.getByLabel(t.exams.maxScore).fill('20');
  await page.getByRole('button', { name: t.exams.create }).click();
  await expect(page).toHaveURL(/\/exams\/[\w-]+$/);
  await expect(page.getByRole('heading', { name: `شهر ${n}` })).toBeVisible();

  const score = (name: string) => page.getByLabel(t.exams.scoreFor.replace('{name}', name));
  await score(nour).fill('25');
  await expect(page.getByText(t.errors.EXAM_SCORE_ABOVE_MAX)).toBeVisible();
  await score(nour).fill('17');
  await page.getByLabel(t.exams.absentFor.replace('{name}', yousef)).check();
  await page.getByRole('button', { name: t.exams.save }).click();
  await expect(page.getByTestId('exam-summary')).toContainText('17/20');

  await page.getByRole('button', { name: t.exams.notify }).click();
  await expect(page.getByRole('status')).toBeVisible();
  await page.reload();
  await expect(page.getByText(t.exams.alreadySent)).toBeVisible();

  // The student, on their own phone, activates and finds the grade.
  const email = `g${n}@example.com`;
  const invite = await api.post(`students/${nourId}/invite`);
  const phone = await browser.newContext({
    viewport: { width: 375, height: 812 },
    hasTouch: true,
    isMobile: true,
  });
  await phone.addInitScript((l) => {
    localStorage.setItem('dafter.locale', l);
    localStorage.setItem('dafter.devInstalled', '1');
  }, lang);
  const app = await phone.newPage();
  await app.goto(`/s/activate/${invite.token}`);
  await app.getByLabel(t.studentApp.email).fill(email);
  await app.getByRole('button', { name: t.studentApp.sendCode }).click();
  await expect(app.getByText(email)).toBeVisible();
  const mail = await app.request.get(`/api/v1/dev/mail?to=${encodeURIComponent(email)}`);
  const code = ((await mail.json()) as { text: string }).text.match(/\d{6}/)![0];
  await app.getByLabel(t.studentApp.code).fill(code);
  await app.getByRole('button', { name: t.studentApp.verify }).click();
  await expect(app).toHaveURL(/\/s$/);
  const grades = app.getByTestId('my-grades');
  await expect(grades).toContainText(`شهر ${n}`);
  await expect(grades).toContainText('17/20');
  await phone.close();
});
