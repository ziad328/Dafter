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

test('a corrected absence is not sent, a move names the old time, and primary only is saved', async ({
  page,
  request,
  lang,
  t,
}) => {
  const secret = process.env.CRON_SECRET;
  test.skip(!secret || !!process.env.E2E_BASE_URL, 'needs the dev CRON_SECRET (see .env.example)');
  const hour = Number(
    new Intl.DateTimeFormat('en-GB', {
      timeZone: 'Africa/Cairo',
      hour: '2-digit',
      hourCycle: 'h23',
    }).format(new Date()),
  );
  test.skip(hour >= 22 || hour < 8, 'quiet hours in Cairo: the messages wait until 08:00');
  // A send pass over every dev workspace: ~45 s locally, more on CI.
  test.setTimeout(120_000);

  // A fresh center, so these parents and switches never meet other tests.
  const n = String(Math.floor(Math.random() * 1e7)).padStart(7, '0');
  const center = `سنتر الرسائل ${n}`;
  const login = await request.post('/api/v1/auth/login', {
    data: { login: STAFF.owner, password: PASSWORD },
  });
  await request.post('/api/v1/workspaces', {
    headers: { authorization: `Bearer ${(await login.json()).accessToken}` },
    data: { type: 'center', nameAr: center },
  });
  const api = await ownerApi(request, center);
  const today = new Intl.DateTimeFormat('en-CA', { timeZone: 'Africa/Cairo' }).format(new Date());
  const addDays = (d: string, k: number) =>
    new Date(Date.parse(d) + k * 86_400_000).toISOString().slice(0, 10);
  const tomorrow = addDays(today, 1);
  const [subject] = await api.get('subjects');
  const [grade] = await api.get('grade-levels');
  const group = await api.post('groups', {
    subjectId: subject.id,
    gradeLevelId: grade.id,
    slots: [
      {
        weekday: new Date(`${tomorrow}T12:00:00Z`).getUTCDay(),
        startTime: '10:00',
        endTime: '11:00',
      },
    ],
  });
  const student = async (name: string, phone: string) => {
    const s = await api.post('students', {
      nameAr: `${name} ${n}`,
      gradeLevelId: grade.id,
      guardian: { phone, relation: 'mother', preferredLocale: lang, whatsappOptIn: false },
    });
    await api.post(`students/${s.id}/enrollments`, { groupId: group.id });
    return s.id as string;
  };
  const present = await student('حاضر', `0151${n}`);
  await student('غائب', `0152${n}`);

  // Closed with both absent, then one is corrected to present before the sender runs.
  const sessions = (await api.get(`sessions?from=${tomorrow}&to=${addDays(tomorrow, 7)}`)) as {
    id: string;
  }[];
  const [first, next] = sessions;
  await api.post(`sessions/${first!.id}/open`);
  await api.post(`sessions/${first!.id}/close`);
  await api.put(`sessions/${first!.id}/attendance/${present}`, { status: 'present' });
  // Next week's session moves to 12:00 the same day.
  const move = await api.patch(`sessions/${next!.id}`, {
    date: addDays(tomorrow, 7),
    startTime: '12:00',
    endTime: '13:00',
  });
  expect(move.status(), await move.text()).toBe(200);
  const tick = await request.get('/api/v1/internal/tick', {
    headers: { authorization: `Bearer ${secret}` },
  });
  expect(tick.status()).toBe(200);

  // The corrected student's parent: no absence, but the move with its old time.
  await signIn(page, t, STAFF.owner);
  await enterWorkspace(page, t, center);
  await page.goto('/dev/phone');
  const moved = lang === 'ar' ? /أصبحت/ : /session on .+ has moved to/;
  const corrected = page.getByTestId('fake-phone').filter({ hasText: `0151${n}` });
  await expect(corrected).toContainText(moved);
  await expect(corrected).not.toContainText(lang === 'ar' ? 'بغياب' : 'absent');
  const absent = page.getByTestId('fake-phone').filter({ hasText: `0152${n}` });
  await expect(absent).toContainText(lang === 'ar' ? 'بغياب' : 'absent');

  // The log says why the corrected one never went out.
  await page.goto('/');
  await openNav(page, t, t.nav.messages);
  await page.getByRole('button', { name: t.messages.status.skipped }).click();
  const log = page.getByTestId('message-log');
  await expect(log.getByText(t.messages.skipReason.not_absent)).toBeVisible();
  await expect(log.getByRole('listitem')).toHaveCount(1);

  // Primary guardian only: saved, and still on after a reload.
  const primary = page.getByRole('checkbox', { name: t.messages.toggles.primaryOnly });
  await expect(primary).not.toBeChecked();
  await primary.check();
  await expect.poll(async () => (await api.get('message-settings')).primaryOnly).toBe(true);
  await page.reload();
  await expect(page.getByRole('checkbox', { name: t.messages.toggles.primaryOnly })).toBeChecked();
});
