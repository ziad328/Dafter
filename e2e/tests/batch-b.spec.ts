import { choose, enterWorkspace, expect, freshCenter, signIn, STAFF, test } from './fixtures';

const addDays = (date: string, n: number) =>
  new Date(Date.parse(date) + n * 86_400_000).toISOString().slice(0, 10);
const weekdayOf = (date: string) => new Date(`${date}T12:00:00Z`).getUTCDay();
const cairoToday = () =>
  new Intl.DateTimeFormat('en-CA', { timeZone: 'Africa/Cairo' }).format(new Date());

const parent = (phone: string) => ({
  phone,
  relation: 'mother',
  preferredLocale: 'ar',
  whatsappOptIn: true,
});

test('a student keeps a second parent, added on their page, and texts only the first', async ({
  page,
  request,
  t,
}) => {
  const { name, api, grade } = await freshCenter(request, 'سنتر الأهل');
  const n = String(Math.floor(Math.random() * 1e7)).padStart(7, '0');
  const s = await api.post('students', {
    nameAr: 'طالب بأبوين',
    gradeLevelId: grade.id,
    guardian: parent(`0151${n}`),
  });

  await signIn(page, t, STAFF.owner);
  await enterWorkspace(page, t, name);
  await page.goto(`/students/${s.id}`);
  await page.getByRole('button', { name: t.students.edit }).click();
  await page.getByRole('button', { name: t.students.addGuardian }).click();
  const second = page.getByLabel(t.students.guardianPhone).nth(1);
  await second.fill(`0152${n}`);
  // Only the first parent gets this student's messages.
  await page.getByRole('checkbox', { name: t.students.primaryGuardianOnly }).check();
  await page.getByRole('button', { name: t.students.save }).click();

  // Saved: back on the summary, which lists both parents.
  await expect(page.getByRole('button', { name: t.students.edit })).toBeVisible();
  await expect(page.getByText(t.students.otherGuardian, { exact: true })).toBeVisible();
  await expect(page.getByText(`0152${n}`)).toBeVisible();
  const saved = (await api.get(`students/${s.id}`)) as {
    primaryGuardianOnly: boolean;
    guardians: { phone: string; isPrimary: boolean }[];
  };
  expect(saved.primaryGuardianOnly).toBe(true);
  expect(saved.guardians).toEqual([
    expect.objectContaining({ phone: `0151${n}`, isPrimary: true }),
    expect.objectContaining({ phone: `0152${n}`, isPrimary: false }),
  ]);
});

test('one session moves to another room; the group keeps its own', async ({ page, request, t }) => {
  const { name, api, subject, grade } = await freshCenter(request, 'سنتر القاعات');
  const roomA = await api.post('rooms', { name: 'قاعة أ' });
  await api.post('rooms', { name: 'قاعة ب' });
  const tomorrow = addDays(cairoToday(), 1);
  const group = await api.post('groups', {
    subjectId: subject.id,
    gradeLevelId: grade.id,
    roomId: roomA.id,
    slots: [{ weekday: weekdayOf(tomorrow), startTime: '10:00', endTime: '11:00' }],
  });
  // The timetable's week starts on Saturday.
  const week = addDays(tomorrow, -((weekdayOf(tomorrow) + 1) % 7));

  await signIn(page, t, STAFF.owner);
  await enterWorkspace(page, t, name);
  await page.goto(`/timetable?week=${week}`);
  const card = page.getByRole('listitem').filter({ hasText: 'قاعة أ' });
  await card.getByRole('button', { name: t.timetable.actions }).click();
  await card.getByRole('button', { name: t.timetable.move }).click();
  await choose(card, t.groups.room, 'قاعة ب');
  await card.getByRole('button', { name: t.timetable.save }).click();
  // Saved: the sheet closes and the card names the new room.
  await expect(page.getByLabel(t.timetable.date)).toHaveCount(0);
  await expect(page.getByRole('listitem').filter({ hasText: 'قاعة ب' })).toBeVisible();

  const sessions = (await api.get(`sessions?from=${tomorrow}&to=${addDays(tomorrow, 7)}`)) as {
    groupId: string;
    room: { name: string } | null;
  }[];
  expect(sessions.filter((x) => x.groupId === group.id).map((x) => x.room?.name)).toEqual([
    'قاعة ب',
    'قاعة أ',
  ]);
});
