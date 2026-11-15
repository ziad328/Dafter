import {
  enterWorkspace,
  expect,
  openNav,
  ownerApi,
  PASSWORD,
  signIn,
  STAFF,
  test,
} from './fixtures';

test('the daily tick sends a fee reminder, and it shows in the message log', async ({
  page,
  request,
  lang,
  t,
}) => {
  const secret = process.env.CRON_SECRET;
  test.skip(!secret || !!process.env.E2E_BASE_URL, 'needs the dev CRON_SECRET (see .env.example)');
  const cairoDay = Number(
    new Intl.DateTimeFormat('en-CA', { timeZone: 'Africa/Cairo', day: 'numeric' }).format(
      new Date(),
    ),
  );
  test.skip(cairoDay < 7, 'fee reminders start on the 7th of the month');

  // A fresh center per run: the switch is on only here, so parallel tests keep their settings.
  const n = String(Math.floor(Math.random() * 1e8)).padStart(8, '0');
  const center = `سنتر التذكير ${n}`;
  const login = await request.post('/api/v1/auth/login', {
    data: { login: STAFF.owner, password: PASSWORD },
  });
  const created = await request.post('/api/v1/workspaces', {
    headers: { authorization: `Bearer ${(await login.json()).accessToken}` },
    data: { type: 'center', nameAr: center },
  });
  expect(created.status()).toBe(201);
  const api = await ownerApi(request, center);
  await api.put('message-settings', {
    absence: true,
    sessionChange: true,
    examResult: true,
    feeOverdue: true,
  });
  const [subject] = await api.get('subjects');
  const [grade] = await api.get('grade-levels');
  const group = await api.post('groups', {
    force: true,
    subjectId: subject.id,
    gradeLevelId: grade.id,
    monthlyFeePiastres: 25_000,
    slots: [{ weekday: 1, startTime: '18:00', endTime: '19:00' }],
  });
  const name = `مدين ${n}`;
  const student = await api.post('students', {
    nameAr: name,
    gradeLevelId: grade.id,
    guardian: { phone: `015${n}`, relation: 'mother', preferredLocale: lang, whatsappOptIn: false },
  });
  // Enrolling bills this month's fee, so the student owes.
  await api.post(`students/${student.id}/enrollments`, { groupId: group.id });

  const tick = await request.get('/api/v1/internal/tick?daily=1', {
    headers: { authorization: `Bearer ${secret}` },
  });
  expect(tick.status()).toBe(200);

  await signIn(page, t, STAFF.owner);
  await enterWorkspace(page, t, center);
  await openNav(page, t, t.nav.messages);
  const item = page.getByTestId('message-log').getByRole('listitem').filter({ hasText: name });
  await expect(item).toHaveCount(1);
  await expect(item).toContainText(t.messages.triggers.fee_overdue);
  await expect(item).toContainText(`015${n}`);
});
