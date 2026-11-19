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

test("owner rewrites the cancellation message, and the parent gets the center's wording", async ({
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
  test.skip(hour >= 22 || hour < 8, 'quiet hours in Cairo: the message waits until 08:00');
  // Two sign-ins and a send pass over every dev workspace: ~45 s locally, more on CI.
  test.setTimeout(120_000);

  // A fresh center, so the custom wording never reaches other tests' parents.
  const n = String(Math.floor(Math.random() * 1e8)).padStart(8, '0');
  const center = `سنتر النص ${n}`;
  const login = await request.post('/api/v1/auth/login', {
    data: { login: STAFF.owner, password: PASSWORD },
  });
  await request.post('/api/v1/workspaces', {
    headers: { authorization: `Bearer ${(await login.json()).accessToken}` },
    data: { type: 'center', nameAr: center },
  });
  const api = await ownerApi(request, center);
  const tomorrow = new Date(
    Date.parse(new Intl.DateTimeFormat('en-CA', { timeZone: 'Africa/Cairo' }).format(new Date())) +
      86_400_000,
  )
    .toISOString()
    .slice(0, 10);
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
  const student = await api.post('students', {
    nameAr: `نادر ${n}`,
    gradeLevelId: grade.id,
    guardian: { phone: `012${n}`, relation: 'father', preferredLocale: lang, whatsappOptIn: false },
  });
  await api.post(`students/${student.id}/enrollments`, { groupId: group.id });

  // The owner writes the cancellation text in both languages, with a preview.
  await signIn(page, t, STAFF.owner);
  await enterWorkspace(page, t, center);
  await openNav(page, t, t.nav.messages);
  await page.getByRole('link', { name: t.messages.settingsTitle }).click();
  const card = page.locator('details').filter({ hasText: t.messages.triggers.session_cancelled });
  await card.locator('summary').click();
  const words = { ar: `حصة {subject} اتلغت يا جماعة ${n}`, en: `No {subject} class, sorry ${n}` };
  for (const l of ['ar', 'en'] as const) {
    const box = card.getByLabel(t.messages.wording.language[l]);
    await box.fill(words[l]);
    await expect(card.getByTestId(`preview-session_cancelled-${l}`)).toContainText(String(n));
  }
  await card.getByRole('button', { name: t.messages.wording.save }).click();
  await expect(card.getByRole('status')).toHaveText(t.messages.wording.saved);
  await expect(card.getByText(t.messages.wording.custom)).toBeVisible();

  // Cancel tomorrow's session, run the sender, and read the parent's phone.
  const sessions = await api.get(`sessions?from=${tomorrow}&to=${tomorrow}`);
  await api.post(
    `sessions/${sessions.find((s: { groupId: string }) => s.groupId === group.id).id}/cancel`,
  );
  const tick = await request.get('/api/v1/internal/tick', {
    headers: { authorization: `Bearer ${secret}` },
  });
  expect(tick.status()).toBe(200);
  await page.goto('/dev/phone');
  const parent = page.getByTestId('fake-phone').filter({ hasText: `012${n}` });
  await expect(parent).toContainText(
    words[lang].replace('{subject}', subject[lang === 'ar' ? 'nameAr' : 'nameEn']),
  );
});
