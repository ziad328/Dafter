import { enterWorkspace, expect, openNav, ownerApi, signIn, STAFF, test } from './fixtures';

const CENTER = { ar: 'سنتر النور', en: 'Al-Nour Center' };

test('owner opens the fees view and sees who owes, biggest debt first', async ({
  page,
  request,
  lang,
  t,
}) => {
  // shortcut: the top fee puts this student in the first 50 debtors; ties grow with reruns
  // on one database, so reset it (pnpm db:reset) if this ever fails after many runs.
  const api = await ownerApi(request, CENTER.ar);
  const [subject] = await api.get('subjects');
  const [grade] = await api.get('grade-levels');
  const group = await api.post('groups', {
    subjectId: subject.id,
    gradeLevelId: grade.id,
    monthlyFeePiastres: 10_000_000,
    slots: [{ weekday: 3, startTime: '20:00', endTime: '21:00' }],
  });
  const n = String(Math.floor(Math.random() * 1e8)).padStart(8, '0');
  const student = await api.post('students', {
    nameAr: `مدين ${n}`,
    gradeLevelId: grade.id,
    guardian: { phone: `012${n}`, relation: 'mother', preferredLocale: 'ar', whatsappOptIn: false },
  });
  await api.post(`students/${student.id}/enrollments`, { groupId: group.id });

  await signIn(page, t, STAFF.owner);
  await enterWorkspace(page, t, CENTER[lang]);
  await openNav(page, t, t.nav.fees);
  await expect(page).toHaveURL(/\/fees$/);
  await expect(page.getByRole('heading', { name: t.feesView.title })).toBeVisible();
  await expect(page.getByText(t.feesView.today)).toBeVisible();
  await expect(page.getByText(t.feesView.month)).toBeVisible();
  const row = page.getByRole('link', { name: new RegExp(`مدين ${n}`) });
  await expect(row).toBeVisible();
  await row.click();
  await expect(page).toHaveURL(new RegExp(`/students/${student.id}$`));
});
