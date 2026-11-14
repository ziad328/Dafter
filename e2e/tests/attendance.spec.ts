import { expect, PASSWORD, STAFF, test } from './fixtures';

const CENTER = { ar: 'سنتر النور', en: 'Al-Nour Center' };
type Hook = { __dafterScan?: (text: string) => Promise<void> };
const cairo = (opts: Intl.DateTimeFormatOptions) =>
  new Intl.DateTimeFormat('en-CA', { timeZone: 'Africa/Cairo', ...opts }).format(new Date());

test('teacher shows the rotating QR; a student scans; the list updates live; close marks absences and texts the parent', async ({
  page,
  browser,
  request,
  lang,
  t,
}) => {
  // Sessions are generated only for start times still ahead, so a slot two minutes from now.
  const [hh, mm] = cairo({ hour: '2-digit', minute: '2-digit', hourCycle: 'h23' })
    .split(':')
    .map(Number) as [number, number];
  const startMin = hh * 60 + mm + 2;
  test.skip(startMin > 23 * 60 + 50, 'too close to midnight in Cairo');
  const today = cairo({ year: 'numeric', month: '2-digit', day: '2-digit' });
  const weekday = new Date(`${today}T12:00:00Z`).getUTCDay();
  const hhmm = (m: number) =>
    `${String(Math.floor(m / 60)).padStart(2, '0')}:${String(m % 60).padStart(2, '0')}`;

  // Data through the API as the owner (who teaches the group); the screens under test are below.
  const login = await request.post('/api/v1/auth/login', {
    data: { login: STAFF.owner, password: PASSWORD },
  });
  const token = (await login.json()).accessToken as string;
  const auth = { authorization: `Bearer ${token}` };
  const workspaces = (await (
    await request.get('/api/v1/workspaces', { headers: auth })
  ).json()) as {
    id: string;
    nameAr: string;
  }[];
  const ws = workspaces.find((w) => w.nameAr === CENTER.ar)!.id;
  const headers = { ...auth, 'x-workspace-id': ws };
  const get = async (url: string) => (await request.get(`/api/v1/${url}`, { headers })).json();
  const post = async (url: string, data?: object) =>
    (await request.post(`/api/v1/${url}`, { headers, data })).json();

  const [subject] = await get('subjects');
  const subjectName = (lang === 'en' ? subject.nameEn : subject.nameAr) as string;
  const [grade] = await get('grade-levels');
  const group = await post('groups', {
    subjectId: subject.id,
    gradeLevelId: grade.id,
    slots: [{ weekday, startTime: hhmm(startMin), endTime: '23:59' }],
  });
  const sessions = (await get(`sessions?from=${today}&to=${today}`)) as {
    id: string;
    groupId: string;
  }[];
  const sessionId = sessions.find((s) => s.groupId === group.id)!.id;

  const n = String(Math.floor(Math.random() * 1e8)).padStart(8, '0');
  const student = async (name: string, phone: string) => {
    const s = await post('students', {
      nameAr: name,
      gradeLevelId: grade.id,
      guardian: { phone, relation: 'mother', preferredLocale: 'ar', whatsappOptIn: false },
    });
    await post(`students/${s.id}/enrollments`, { groupId: group.id });
    return s.id as string;
  };
  const scanner = `مريم ${n}`;
  const absent = `يوسف ${n}`;
  const scannerId = await student(scanner, `012${n}`);
  await student(absent, `015${n}`);
  const { token: invite } = await post(`students/${scannerId}/invite`);

  // The teacher's screen, with a fake clock so the QR's rotation can be checked.
  await page.clock.install();
  await page.goto('/login');
  await page.getByLabel(t.auth.login.login).fill(STAFF.owner);
  await page.getByLabel(t.auth.login.password).fill(PASSWORD);
  await page.getByRole('button', { name: t.auth.login.submit }).click();
  await page.getByRole('button', { name: CENTER[lang] }).click();
  await page.goto(`/sessions/${sessionId}/live`);
  const qr = page.getByTestId('session-qr');
  await expect(qr).toBeVisible();
  // The class list shows every enrolled student before anyone scans, each with a one-tap "present".
  const list = page.getByTestId('live-list');
  const mark = (name: string) =>
    list.getByRole('button', { name: t.live.markPresent.replace('{name}', name) });
  await expect(mark(scanner)).toBeVisible();
  await expect(mark(absent)).toBeVisible();

  // The student's phone: activate, bind, scan.
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
  const s = await phone.newPage();
  const email = `scan${n}@example.com`;
  await s.goto(`/s/activate/${invite}`);
  await s.getByLabel(t.studentApp.email).fill(email);
  await s.getByRole('button', { name: t.studentApp.sendCode }).click();
  await expect(s.getByText(email)).toBeVisible();
  const mail = await s.request.get(`/api/v1/dev/mail?to=${encodeURIComponent(email)}`);
  const code = ((await mail.json()) as { text: string }).text.match(/\d{6}/)![0];
  await s.getByLabel(t.studentApp.code).fill(code);
  await s.getByRole('button', { name: t.studentApp.verify }).click();
  await expect(s.getByText(t.studentApp.bound)).toBeVisible();
  await s.getByRole('link', { name: t.scan.open }).click();
  await s.waitForFunction(() => !!(window as Hook).__dafterScan);

  // No camera in the test: hand the teacher's current QR text to the scanner's dev hook.
  const shown = (await qr.getAttribute('data-code'))!;
  await s.evaluate((text) => (window as Hook).__dafterScan!(text), shown);
  await expect(s.getByText(t.scan.done.present)).toBeVisible();
  // The student's home lists today's session and the check-in.
  await s.getByRole('link', { name: t.scan.back }).click();
  await expect(s.getByTestId('my-schedule')).toContainText(subjectName);
  await expect(s.getByTestId('my-attendance')).toContainText(t.live.status.present);
  await phone.close();

  // Live: the teacher sees the scan without reloading.
  await expect(mark(scanner)).toBeHidden();
  await expect(list.getByRole('listitem').filter({ hasText: scanner })).toContainText(
    t.live.status.present,
  );

  // Ten seconds later the QR is a new code.
  await page.clock.fastForward(10_000);
  await expect(qr).not.toHaveAttribute('data-code', shown);

  await page.getByRole('button', { name: t.live.close }).click();
  await page.getByRole('button', { name: t.live.confirmClose }).click();
  await expect(page.getByText(t.live.closed)).toBeVisible();
  await expect(list.getByRole('listitem').filter({ hasText: absent })).toContainText(
    t.live.status.absent,
  );
  // The assistant can still fix it after class: one tap marks the absent student present.
  await mark(absent).click();
  await expect(mark(absent)).toBeHidden();
  await expect(list.getByRole('listitem').filter({ hasText: absent })).not.toContainText(
    t.live.status.absent,
  );

  // The absent student's parent gets one message on the fake phone (worker polls every minute).
  const hour = Number(cairo({ hour: '2-digit', hourCycle: 'h23' }));
  if (hour >= 22 || hour < 8)
    return test.info().annotations.push({
      type: 'skip',
      description: 'quiet hours in Cairo: the message waits until 08:00',
    });
  test.setTimeout(150_000);
  await expect
    .poll(async () => JSON.stringify(await get('dev/phone')), {
      timeout: 80_000,
      intervals: [5000],
    })
    .toContain(`015${n}`);
  await page.goto('/dev/phone');
  const parent = page.getByTestId('fake-phone').filter({ hasText: `015${n}` });
  await expect(parent).toContainText(absent);
  await expect(parent.getByText(absent)).toHaveCount(1);
});
