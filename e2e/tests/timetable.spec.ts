import { expect, signIn, STAFF, test } from './fixtures';

const CENTER = { ar: 'سنتر النور', en: 'Al-Nour Center' };
const PHYSICS = { ar: 'الفيزياء', en: 'Physics' };
const SEC3 = { ar: 'الصف الثالث الثانوي', en: 'Secondary 3' };

const pad = (n: number) => String(n).padStart(2, '0');
const cairoDate = (d: Date) =>
  new Intl.DateTimeFormat('en-CA', { timeZone: 'Africa/Cairo' }).format(d);
const addDays = (date: string, n: number) =>
  new Date(Date.parse(date) + n * 86_400_000).toISOString().slice(0, 10);
const weekStart = (date: string) => addDays(date, -((new Date(date).getUTCDay() + 1) % 7));

test('owner sees generated sessions, then moves and cancels one', async ({ page, lang, t }) => {
  // The dev database is not reset between runs, so this run's group gets a random time.
  const hour = 8 + Math.floor(Math.random() * 10);
  const minute = pad(Math.floor(Math.random() * 60));
  const [start, end] = [`${pad(hour)}:${minute}`, `${pad(hour + 1)}:${minute}`];
  const tomorrow = addDays(cairoDate(new Date()), 1);

  await signIn(page, t, STAFF.owner);
  await page.getByRole('button', { name: CENTER[lang] }).click();
  await page.getByRole('link', { name: t.home.groups }).click();
  await page.getByRole('link', { name: t.groups.new }).click();
  await page.getByLabel(t.groups.subject).selectOption({ label: PHYSICS[lang] });
  await page.getByLabel(t.groups.gradeLevel).selectOption({ label: SEC3[lang] });
  await page.getByLabel(t.groups.day).selectOption(String(new Date(tomorrow).getUTCDay()));
  await page.getByLabel(t.groups.start).fill(start);
  await page.getByLabel(t.groups.end).fill(end);
  await page.getByRole('button', { name: t.groups.create }).click();
  await expect(page).toHaveURL(/\/groups$/);

  await page.goto('/');
  await page.getByRole('link', { name: t.home.timetable }).click();
  await expect(page.getByRole('heading', { name: t.timetable.title })).toBeVisible();
  // Tomorrow can fall in next week (the week starts on Saturday).
  if (weekStart(tomorrow) !== weekStart(cairoDate(new Date())))
    await page.getByRole('button', { name: t.timetable.nextWeek }).click();

  const card = page.locator('[data-slot="card"]', { hasText: `${start}–${end}` });
  await expect(
    card.getByRole('heading', { name: `${PHYSICS[lang]} · ${SEC3[lang]}` }),
  ).toBeVisible();

  // Move it one hour later on the same day.
  await card.getByRole('button', { name: t.timetable.move }).click();
  const later = `${pad(hour + 1)}:${minute}`;
  const latest = `${pad(hour + 2)}:${minute}`;
  await card.getByLabel(t.timetable.start).fill(later);
  await card.getByLabel(t.timetable.end).fill(latest);
  await card.getByRole('button', { name: t.timetable.save }).click();
  const moved = page.locator('[data-slot="card"]', { hasText: `${later}–${latest}` });
  await expect(moved.getByText(t.timetable.moved)).toBeVisible();

  // Cancel takes a second tap to confirm.
  await moved.getByRole('button', { name: t.timetable.cancel }).click();
  await moved.getByRole('button', { name: t.timetable.confirmCancel }).click();
  await expect(moved.getByText(t.timetable.status.cancelled)).toBeVisible();
  await expect(moved.getByRole('button', { name: t.timetable.move })).toHaveCount(0);
});
