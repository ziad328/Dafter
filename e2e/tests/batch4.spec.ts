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

// Opening tomorrow's session answers 409 SESSION_TOO_EARLY on purpose.
test.use({ expectedErrors: ['/open', 'status of 409 (Conflict)'] });

const addDays = (date: string, n: number) =>
  new Date(Date.parse(date) + n * 86_400_000).toISOString().slice(0, 10);
const weekdayOf = (date: string) => new Date(`${date}T12:00:00Z`).getUTCDay();

test("a teacher reads their own groups' messages with masked phones, and can't open tomorrow", async ({
  page,
  request,
  t,
}) => {
  // A fresh center with its own teacher: nothing here touches the seeded data.
  const n = String(Math.floor(Math.random() * 1e7)).padStart(7, '0');
  const center = `سنتر المدرس ${n}`;
  const login = await request.post('/api/v1/auth/login', {
    data: { login: STAFF.owner, password: PASSWORD },
  });
  await request.post('/api/v1/workspaces', {
    headers: { authorization: `Bearer ${(await login.json()).accessToken}` },
    data: { type: 'center', nameAr: center },
  });
  const api = await ownerApi(request, center);
  const teacherPhone = `0144${n}`;
  const teacherName = `مدرّس ${n}`;
  const { token } = await api.post('invites', { role: 'teacher' });
  const reg = await request.post('/api/v1/auth/register', {
    data: { name: teacherName, phone: teacherPhone, password: PASSWORD },
  });
  const accept = await request.post(`/api/v1/invites/${token}/accept`, {
    headers: { authorization: `Bearer ${(await reg.json()).accessToken}` },
  });
  expect(accept.status()).toBe(200);
  const teacher = ((await api.get('members')) as { id: string; name: string }[]).find(
    (m) => m.name === teacherName,
  )!;

  // The teacher's group meets tomorrow, the owner's own group the day after.
  const today = new Intl.DateTimeFormat('en-CA', { timeZone: 'Africa/Cairo' }).format(new Date());
  const tomorrow = addDays(today, 1);
  const [subject] = await api.get('subjects');
  const [grade] = await api.get('grade-levels');
  const groupOn = (date: string, teacherMembershipId?: string) =>
    api.post('groups', {
      teacherMembershipId,
      subjectId: subject.id,
      gradeLevelId: grade.id,
      slots: [{ weekday: weekdayOf(date), startTime: '10:00', endTime: '11:00' }],
    });
  const mine = await groupOn(tomorrow, teacher.id);
  const owners = await groupOn(addDays(tomorrow, 1));
  const enroll = async (groupId: string, phone: string, nameAr: string) => {
    const s = await api.post('students', {
      nameAr,
      gradeLevelId: grade.id,
      guardian: { phone, relation: 'mother', preferredLocale: 'ar', whatsappOptIn: false },
    });
    await api.post(`students/${s.id}/enrollments`, { groupId: groupId });
  };
  const myParent = `0161${n}`;
  const otherParent = `0162${n}`;
  await enroll(mine.id, myParent, 'طالب المدرس');
  await enroll(owners.id, otherParent, 'طالب المالك');
  // Next week's session of each group is cancelled: one message per parent.
  const sessionOf = async (groupId: string, date: string) =>
    ((await api.get(`sessions?from=${date}&to=${date}`)) as { id: string; groupId: string }[]).find(
      (s) => s.groupId === groupId,
    )!.id;
  await api.post(`sessions/${await sessionOf(mine.id, addDays(tomorrow, 7))}/cancel`);
  await api.post(`sessions/${await sessionOf(owners.id, addDays(tomorrow, 8))}/cancel`);

  // The teacher finds Messages under More: their parent only, the phone masked.
  await signIn(page, t, teacherPhone);
  await enterWorkspace(page, t, center);
  await openNav(page, t, t.nav.messages);
  await expect(page.getByText(t.messages.teacherView)).toBeVisible();
  await expect(page.getByRole('heading', { name: t.messages.settings })).toHaveCount(0);
  const log = page.getByTestId('message-log');
  await expect(log.getByRole('listitem')).toHaveCount(1);
  await expect(log).toContainText(`••••••••${myParent.slice(-3)}`);
  await expect(log).toContainText('طالب المدرس');
  await expect(log).not.toContainText(myParent);

  // Tomorrow's session can't be opened yet; the screen says from when.
  await page.goto(`/sessions/${await sessionOf(mine.id, tomorrow)}/live`);
  const [before] = t.live.tooEarly.split('{time}');
  await expect(page.getByRole('alert')).toContainText(before!.trim());
  await expect(page.getByTestId('session-qr')).toHaveCount(0);
});
