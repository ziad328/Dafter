import {
  enterWorkspace,
  expect,
  GROUP_CONFLICT,
  openNav,
  ownerApi,
  PASSWORD,
  signIn,
  STAFF,
  submitGroup,
  test,
} from './fixtures';

// Restoring in the seeded center may meet the owner's other groups: answered with Save anyway.
test.use({ expectedErrors: GROUP_CONFLICT });

const CENTER = { ar: 'سنتر النور', en: 'Al-Nour Center' };

test('owner archives a group, and it leaves the active list', async ({
  page,
  request,
  lang,
  t,
}) => {
  const api = await ownerApi(request, CENTER.ar);
  const [subject] = await api.get('subjects');
  const [grade] = await api.get('grade-levels');
  const label = `أرشيف ${Math.floor(Math.random() * 1e6)}`;
  const group = await api.post('groups', {
    force: true,
    subjectId: subject.id,
    gradeLevelId: grade.id,
    label,
    slots: [{ weekday: 4, startTime: '20:00', endTime: '21:00' }],
  });

  await signIn(page, t, STAFF.owner);
  await enterWorkspace(page, t, CENTER[lang]);
  await page.goto(`/groups/${group.id}/edit`);
  await page.getByRole('button', { name: t.groups.archive }).click();
  await page.getByRole('button', { name: t.groups.confirmArchive }).click();
  await expect(page).toHaveURL(/\/groups$/);
  const card = page.getByRole('link').filter({ hasText: label });
  await expect(card).toContainText(t.groups.archived);

  // Restore it again in one tap.
  await card.click();
  await page.getByRole('link', { name: t.groups.editShort }).click();
  await submitGroup(page, t, t.groups.restore);
  await expect(page).toHaveURL(/\/groups$/);
  await expect(page.getByRole('link').filter({ hasText: label })).not.toContainText(
    t.groups.archived,
  );
});

test('owner sets the late threshold from Settings', async ({ page, request, t }) => {
  // A fresh center: the threshold here must not change other tests' late check-ins.
  const center = `سنتر الإعدادات ${Math.floor(Math.random() * 1e8)}`;
  const login = await request.post('/api/v1/auth/login', {
    data: { login: STAFF.owner, password: PASSWORD },
  });
  await request.post('/api/v1/workspaces', {
    headers: { authorization: `Bearer ${(await login.json()).accessToken}` },
    data: { type: 'center', nameAr: center },
  });

  await signIn(page, t, STAFF.owner);
  await enterWorkspace(page, t, center);
  await openNav(page, t, t.nav.settings);
  const field = page.getByLabel(t.settings.late);
  await expect(field).toHaveValue('15');
  await field.fill('10');
  await page.getByRole('button', { name: t.settings.save }).click();
  await expect(page.getByRole('status')).toHaveText(t.settings.saved);
  await page.reload();
  await expect(page.getByLabel(t.settings.late)).toHaveValue('10');
  expect(
    (await (await ownerApi(request, center)).get('attendance-settings')).lateAfterMinutes,
  ).toBe(10);
});
