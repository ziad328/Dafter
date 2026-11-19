import { enterWorkspace, expect, freshCenter, PASSWORD, STAFF, test } from './fixtures';

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
  const c = await freshCenter(request, 'سنتر الحضور');
  const { get, post } = c.api;

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
  await enterWorkspace(page, t, c.name);
  await page.goto(`/sessions/${sessionId}/live`);
  const qr = page.getByTestId('session-qr');
  await expect(qr).toBeVisible();
  // The class list shows every enrolled student before anyone scans, each with a one-tap "present".
  const list = page.getByTestId('live-list');
  const mark = (name: string) =>
    list.getByRole('button', { name: t.live.markPresent.replace('{name}', name) });
  await expect(mark(scanner)).toBeVisible();
  await expect(mark(absent)).toBeVisible();

  // On a phone: the class list is one tap away, and the QR can take the whole screen.
  await page.getByRole('button', { name: t.live.toList }).click();
  await expect(list).toBeInViewport();
  await page.getByRole('button', { name: t.live.fullScreen }).click();
  await expect(qr).toBeInViewport({ ratio: 1 });
  await page.getByRole('button', { name: t.live.exitFullScreen }).click();
  await expect(page.getByRole('button', { name: t.live.fullScreen })).toBeVisible();

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
  // A phone with a back and a front camera (Playwright has none): canvas streams stand in.
  await phone.addInitScript(() => {
    const cams = ['back', 'front'].map((id) => ({
      deviceId: id,
      groupId: 'g',
      kind: 'videoinput',
      label: id,
    }));
    const asked: string[] = [];
    (window as { cameraAsks?: string[] }).cameraAsks = asked;
    navigator.mediaDevices.enumerateDevices = async () =>
      cams.map((c) => ({ ...c, toJSON: () => c })) as MediaDeviceInfo[];
    navigator.mediaDevices.getUserMedia = async (c) => {
      const id =
        ((c?.video as MediaTrackConstraints)?.deviceId as { exact?: string })?.exact ?? 'back';
      asked.push(id);
      const canvas = Object.assign(document.createElement('canvas'), { width: 64, height: 64 });
      canvas.getContext('2d')!.fillRect(0, 0, 64, 64);
      const stream = canvas.captureStream(5);
      stream.getVideoTracks()[0]!.getSettings = () => ({ deviceId: id });
      return stream;
    };
  });
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
  // The check-in button appears only once the phone is bound.
  await expect(s.getByRole('link', { name: t.scan.open })).toBeVisible();
  await s.getByRole('link', { name: t.scan.open }).click();
  await s.waitForFunction(() => !!(window as Hook).__dafterScan);
  // Two cameras: a switch button moves to the other one.
  await s.getByRole('button', { name: t.scan.switchCamera }).click();
  await expect
    .poll(() => s.evaluate(() => (window as { cameraAsks?: string[] }).cameraAsks?.join(',')))
    .toContain('front');
  await s.waitForFunction(() => !!(window as Hook).__dafterScan);

  // No camera in the test: hand the teacher's current QR text to the scanner's dev hook.
  const shown = (await qr.getAttribute('data-code'))!;
  await s.evaluate((text) => (window as Hook).__dafterScan!(text), shown);
  await expect(s.getByText(t.scan.done.present)).toBeVisible();
  // It names the class, then goes home by itself (audit 3 SA9).
  await expect(s.getByTestId('scan-class')).toContainText(subjectName);
  await expect(s).toHaveURL(/\/s$/);
  // The student's home lists today's session and the check-in.
  await expect(s.getByTestId('my-schedule')).toContainText(subjectName);
  await expect(s.getByTestId('my-attendance')).toContainText(t.live.status.present);
  await expect(s.getByTestId('attendance-rate')).toHaveText(
    t.studentApp.rate.replace('{attended}', '1').replace('{total}', '1'),
  );
  await phone.close();

  // Live: the teacher sees the scan without reloading.
  await expect(mark(scanner)).toBeHidden();
  await expect(list.getByRole('listitem').filter({ hasText: scanner })).toContainText(
    t.live.status.present,
  );
  // A wrong status is fixed on the spot: tap it, pick the right one.
  const scannerRow = list.getByRole('listitem').filter({ hasText: scanner });
  await scannerRow.getByRole('button', { name: t.live.change.replace('{name}', scanner) }).click();
  await scannerRow.getByRole('button', { name: t.live.status.late, exact: true }).click();
  await expect(
    scannerRow.getByRole('button', { name: t.live.change.replace('{name}', scanner) }),
  ).toHaveText(t.live.status.late);

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
  // ...and back again: they really were absent. Had the sender run while they were marked
  // present, the message would be skipped (re-checked at send time); now it goes out once.
  const absentRow = list.getByRole('listitem').filter({ hasText: absent });
  await absentRow.getByRole('button', { name: t.live.change.replace('{name}', absent) }).click();
  await absentRow.getByRole('button', { name: t.live.status.absent, exact: true }).click();
  // Absent again: the row is back to its one-tap "present" button.
  await expect(mark(absent)).toBeVisible();
  await expect(absentRow).toContainText(t.live.status.absent);

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
