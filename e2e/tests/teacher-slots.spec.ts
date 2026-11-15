import {
  choose,
  enterWorkspace,
  expect,
  GROUP_CONFLICT,
  openNav,
  ownerApi,
  PASSWORD,
  signIn,
  STAFF,
  test,
} from './fixtures';

test.use({ expectedErrors: GROUP_CONFLICT });

const PHYSICS = { ar: 'الفيزياء', en: 'Physics' };
const SEC3 = { ar: 'الصف الثالث الثانوي', en: 'Secondary 3' };

test('a second group at the same time as the teacher’s first warns, and saves anyway', async ({
  page,
  request,
  lang,
  t,
}) => {
  // A fresh center: the owner teaches one group there, on the form's default slot.
  const center = `سنتر المواعيد ${Math.floor(Math.random() * 1e8)}`;
  const login = await request.post('/api/v1/auth/login', {
    data: { login: STAFF.owner, password: PASSWORD },
  });
  await request.post('/api/v1/workspaces', {
    headers: { authorization: `Bearer ${(await login.json()).accessToken}` },
    data: { type: 'center', nameAr: center },
  });
  const api = await ownerApi(request, center);
  const [subject] = await api.get('subjects');
  const [grade] = await api.get('grade-levels');
  await api.post('groups', {
    subjectId: subject.id,
    gradeLevelId: grade.id,
    slots: [{ weekday: 6, startTime: '16:00', endTime: '17:30' }],
  });

  await signIn(page, t, STAFF.owner);
  await enterWorkspace(page, t, center);
  await openNav(page, t, t.nav.groups);
  await page.getByRole('link', { name: t.groups.new }).click();
  await choose(page, t.groups.subject, PHYSICS[lang]);
  await choose(page, t.groups.gradeLevel, SEC3[lang]);
  await page.getByRole('button', { name: t.groups.create }).click();

  // «المدرس عنده مجموعة أخرى يوم السبت …»: the text before {day}, and nothing saved yet.
  const warning = page
    .getByRole('alert')
    .filter({ hasText: t.groups.teacherBusyAt.split('{')[0]!.trim() });
  await expect(warning).toBeVisible();
  await expect(page).toHaveURL(/\/groups\/new$/);

  await warning.getByRole('button', { name: t.groups.saveAnyway }).click();
  await expect(page).toHaveURL(/\/groups$/);
  await expect.poll(async () => ((await api.get('groups')) as unknown[]).length).toBe(2);
});
