import type { APIRequestContext } from '@playwright/test';
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

// GROUP_FULL and TEACHER_BOOKED answer 409 on purpose.
test.use({
  expectedErrors: ['/enrollments', '/api/v1/sessions/', 'status of 409 (Conflict)'],
});

const CENTER = { ar: 'سنتر النور', en: 'Al-Nour Center' };
const cairoDate = (d: Date) =>
  new Intl.DateTimeFormat('en-CA', { timeZone: 'Africa/Cairo' }).format(d);
const addDays = (date: string, n: number) =>
  new Date(Date.parse(date) + n * 86_400_000).toISOString().slice(0, 10);
const weekStart = (date: string) => addDays(date, -((new Date(date).getUTCDay() + 1) % 7));
const weekdayOf = (date: string) => new Date(date).getUTCDay();

/** A fresh center owned by the seeded owner, so these tests never touch shared groups. */
async function freshCenter(request: APIRequestContext, prefix: string) {
  const name = `${prefix} ${Math.floor(Math.random() * 1e8)}`;
  const login = await request.post('/api/v1/auth/login', {
    data: { login: STAFF.owner, password: PASSWORD },
  });
  await request.post('/api/v1/workspaces', {
    headers: { authorization: `Bearer ${(await login.json()).accessToken}` },
    data: { type: 'center', nameAr: name },
  });
  const api = await ownerApi(request, name);
  const [subject] = await api.get('subjects');
  const [grade] = await api.get('grade-levels');
  return { name, api, subject, grade };
}

test('a new student joins a full group after the confirm', async ({ page, request, lang, t }) => {
  const c = await freshCenter(request, 'سنتر السعة');
  const group = await c.api.post('groups', {
    subjectId: c.subject.id,
    gradeLevelId: c.grade.id,
    capacity: 1,
    slots: [{ weekday: 2, startTime: '18:00', endTime: '19:00' }],
  });
  const first = await c.api.post('students', {
    nameAr: 'منى',
    gradeLevelId: c.grade.id,
    guardian: {
      phone: '01200000001',
      relation: 'mother',
      preferredLocale: lang,
      whatsappOptIn: false,
    },
  });
  await c.api.post(`students/${first.id}/enrollments`, { groupId: group.id });

  await signIn(page, t, STAFF.owner);
  await enterWorkspace(page, t, c.name);
  await page.goto('/students/new');
  await page.getByLabel(t.students.nameAr, { exact: true }).fill('سارة');
  const gradeName = lang === 'en' ? c.grade.nameEn : c.grade.nameAr;
  await choose(page, t.students.gradeLevel, gradeName);
  await choose(page, `${t.enrollments.group} ${t.form.optional}`, gradeName);
  await page.getByLabel(t.students.guardianPhone, { exact: true }).fill('01200000002');
  await page.getByRole('button', { name: t.students.create }).click();

  const confirm = page.getByRole('alert');
  await expect(confirm).toContainText('1/1');
  await expect(confirm).toContainText(t.enrollments.full.split('(')[0]!.trim());
  await confirm.getByRole('button', { name: t.enrollments.addAnyway }).click();
  await expect(page).toHaveURL(/\/students\/[0-9a-f-]{36}$/);
  await expect(page.getByText(t.enrollments.empty)).toHaveCount(0);
  const students = await c.api.get(`students?groupId=${group.id}`);
  expect(students).toHaveLength(2);
});

test('moving a session onto the teacher’s other session is refused', async ({
  page,
  request,
  t,
}) => {
  const c = await freshCenter(request, 'سنتر المواعيد');
  const tomorrow = addDays(cairoDate(new Date()), 1);
  const later = addDays(tomorrow, 1);
  const make = (weekday: number, startTime: string, endTime: string, label: string) =>
    c.api.post('groups', {
      subjectId: c.subject.id,
      gradeLevelId: c.grade.id,
      label,
      slots: [{ weekday, startTime, endTime }],
    });
  const tag = String(Math.floor(Math.random() * 1e6));
  await make(weekdayOf(tomorrow), '16:00', '17:30', `A-${tag}`);
  await make(weekdayOf(later), '10:00', '11:00', `B-${tag}`);
  const [session] = (await c.api.get(`sessions?from=${later}&to=${later}`)) as { id: string }[];
  expect(session).toBeTruthy();

  await signIn(page, t, STAFF.owner);
  await enterWorkspace(page, t, c.name);
  await openNav(page, t, t.nav.timetable);
  await page.goto(`/timetable?week=${weekStart(later)}`);
  const card = page
    .getByRole('listitem')
    .filter({ hasText: `B-${tag}` })
    .filter({
      has: page.getByRole('button', { name: t.timetable.actions }),
    });
  await card.getByRole('button', { name: t.timetable.actions }).click();
  await card.getByRole('button', { name: t.timetable.move }).click();
  await card.getByLabel(t.timetable.date).fill(tomorrow);
  await card.getByLabel(t.timetable.start).fill('16:30');
  await card.getByLabel(t.timetable.end).fill('17:00');
  await card.getByRole('button', { name: t.timetable.save }).click();
  const alert = card.getByRole('alert');
  await expect(alert).toContainText(t.timetable.teacherBookedAt.split('{day}')[0]!.trim());
  await expect(alert).toContainText(new RegExp(`4:00\\s(PM|م)`));

  // Nothing moved.
  const [still] = (await c.api.get(`sessions?from=${later}&to=${later}`)) as {
    id: string;
    moved: boolean;
  }[];
  expect([still?.id, still?.moved]).toEqual([session!.id, false]);
});

test('the dashboard switches to a term and half a year', async ({ page, lang, t }) => {
  await signIn(page, t, STAFF.owner);
  await enterWorkspace(page, t, CENTER[lang]);
  await openNav(page, t, t.nav.dashboard);
  const range = page.getByRole('group', { name: t.dashboard.range });
  const bars = page.getByRole('list', { name: t.dashboard.attendance });
  await expect(bars.getByRole('listitem')).toHaveCount(8);
  for (const n of [13, 26]) {
    await range.getByRole('button', { name: new RegExp(`^${n}`) }).click();
    await expect(range.getByRole('button', { name: new RegExp(`^${n}`) })).toHaveAttribute(
      'aria-pressed',
      'true',
    );
    await expect(bars.getByRole('listitem')).toHaveCount(n);
  }
});
