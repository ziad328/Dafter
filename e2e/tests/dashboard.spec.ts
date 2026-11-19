import { enterWorkspace, expect, freshCenter, openNav, signIn, STAFF, test } from './fixtures';

test('the owner opens the dashboard and finds a group with its exam average; a teacher sees no money', async ({
  page,
  request,
  lang,
  t,
}) => {
  const c = await freshCenter(request, 'سنتر اللوحة', ['teacher']);
  const { api, subject, grade } = c;
  const n = String(Math.floor(Math.random() * 1e8)).padStart(8, '0');
  const label = `لوحة ${n}`;
  const group = await api.post('groups', {
    subjectId: subject.id,
    gradeLevelId: grade.id,
    label,
    slots: [{ weekday: 6, startTime: '16:00', endTime: '17:30' }],
  });
  const student = await api.post('students', {
    nameAr: `ليلى ${n}`,
    gradeLevelId: grade.id,
    guardian: { phone: `016${n}`, relation: 'mother', preferredLocale: lang, whatsappOptIn: false },
  });
  await api.post(`students/${student.id}/enrollments`, { groupId: group.id });
  const today = new Intl.DateTimeFormat('en-CA', { timeZone: 'Africa/Cairo' }).format(new Date());
  const exam = await api.post(`groups/${group.id}/exams`, {
    title: 'شهر',
    heldOn: today,
    maxScore: 20,
  });
  await api.put(`exams/${exam.id}/results`, {
    results: [{ studentId: student.id, score: 16, absent: false }],
  });

  await signIn(page, t, STAFF.owner);
  await enterWorkspace(page, t, c.name);
  await openNav(page, t, t.nav.dashboard);
  await expect(page.getByRole('heading', { name: t.dashboard.title })).toBeVisible();
  await expect(page.getByTestId('money-trend')).toBeVisible();
  // Long lists show the lowest attendance first, the rest behind «عرض الكل».
  const all = page.getByRole('button', { name: t.dashboard.showAll.split(' (')[0]! });
  if (await all.isVisible()) await all.click();
  const card = page.getByRole('listitem').filter({ hasText: label });
  await expect(card).toContainText(t.dashboard.lastAverage.replace('{pct}', '80'));
  await card.getByRole('link').click();
  await expect(page).toHaveURL(new RegExp(`/groups/${group.id}/exams$`));

  // A teacher in the same center: the dashboard, never the money.
  await page.context().clearCookies();
  await signIn(page, t, STAFF.teacher);
  await enterWorkspace(page, t, c.name);
  await page.goto('/dashboard');
  await expect(page.getByRole('heading', { name: t.dashboard.title })).toBeVisible();
  await expect(page.getByTestId('money-trend')).toHaveCount(0);
});
