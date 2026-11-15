import {
  choose,
  enterWorkspace,
  expect,
  openNav,
  ownerApi,
  PASSWORD,
  signIn,
  STAFF,
  test,
} from './fixtures';

// The last-owner removal answers 409 LAST_OWNER on purpose.
test.use({ expectedErrors: ['/api/v1/members/', 'status of 409 (Conflict)'] });

test('the owner invites an assistant with their teacher, removes the teacher, and stays owner', async ({
  page,
  request,
  t,
}) => {
  // A fresh center: removing people must never touch the seeded staff.
  const n = String(Math.floor(Math.random() * 1e7)).padStart(7, '0');
  const center = `سنتر الفريق ${n}`;
  const login = await request.post('/api/v1/auth/login', {
    data: { login: STAFF.owner, password: PASSWORD },
  });
  await request.post('/api/v1/workspaces', {
    headers: { authorization: `Bearer ${(await login.json()).accessToken}` },
    data: { type: 'center', nameAr: center },
  });
  const api = await ownerApi(request, center);
  /** A new account that accepts an invite; returns its name. */
  const joins = async (token: string, name: string, phone: string) => {
    const reg = await request.post('/api/v1/auth/register', {
      data: { name, phone, password: PASSWORD },
    });
    const accept = await request.post(`/api/v1/invites/${token}/accept`, {
      headers: { authorization: `Bearer ${(await reg.json()).accessToken}` },
    });
    expect(accept.status()).toBe(200);
  };
  const teacherName = `مدرّس ${n}`;
  await joins((await api.post('invites', { role: 'teacher' })).token, teacherName, `0141${n}`);
  const teacher = ((await api.get('members')) as { id: string; name: string }[]).find(
    (m) => m.name === teacherName,
  )!;
  const [subject] = await api.get('subjects');
  const [grade] = await api.get('grade-levels');
  await api.post('groups', {
    force: true,
    teacherMembershipId: teacher.id,
    subjectId: subject.id,
    gradeLevelId: grade.id,
    label: `ف ${n}`,
    slots: [{ weekday: 3, startTime: '18:00', endTime: '19:00' }],
  });

  // The owner makes an assistant's link that already names the teacher.
  await signIn(page, t, STAFF.owner);
  await enterWorkspace(page, t, center);
  await openNav(page, t, t.nav.staff);
  await choose(page, t.members.role, t.roles.assistant);
  await page
    .getByRole('group', { name: t.members.inviteWorksFor })
    .getByRole('checkbox', { name: teacherName })
    .check();
  await page.getByRole('button', { name: t.members.createLink }).click();
  const link = (await page.getByTestId('staff-invite-link').textContent())!;
  const assistantName = `مساعد ${n}`;
  await joins(link.split('/invite/')[1]!, assistantName, `0142${n}`);
  await page.reload();
  const assistantRow = page.getByRole('listitem').filter({ hasText: assistantName });
  await expect(assistantRow).toContainText(t.members.worksForList.replace('{names}', teacherName));

  // Remove the teacher: a second tap confirms; their group stays, flagged.
  const manage = t.members.manage.replace('{name}', teacherName);
  await page
    .getByRole('listitem')
    .filter({ hasText: teacherName })
    .first()
    .getByRole('button', { name: manage })
    .click();
  const sheet = page.getByRole('dialog', { name: manage });
  await sheet.getByRole('button', { name: t.members.remove }).click();
  await sheet.getByRole('button', { name: t.members.confirmRemove }).click();
  await expect(sheet).toBeHidden();
  await expect(page.getByRole('heading', { name: teacherName })).toHaveCount(0);
  await expect(assistantRow).toContainText(t.members.worksForNone);
  await openNav(page, t, t.nav.groups);
  await expect(
    page
      .getByRole('link')
      .filter({ hasText: `ف ${n}` })
      .getByText(t.groups.teacherRemoved),
  ).toBeVisible();

  // The only owner can't remove themselves.
  await openNav(page, t, t.nav.staff);
  const me = t.members.manage.replace('{name}', 'أحمد محمود');
  await page.getByRole('button', { name: me }).click();
  const own = page.getByRole('dialog', { name: me });
  await own.getByRole('button', { name: t.members.remove }).click();
  await own.getByRole('button', { name: t.members.confirmRemove }).click();
  await expect(own.getByRole('alert')).toHaveText(t.errors.LAST_OWNER);
});
