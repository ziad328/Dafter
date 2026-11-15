import { choose, enterWorkspace, expect, openNav, signIn, STAFF, test } from './fixtures';

const CENTER = { ar: 'سنتر النور', en: 'Al-Nour Center' };
const PHYSICS = { ar: 'الفيزياء', en: 'Physics' };
const SEC3 = { ar: 'الصف الثالث الثانوي', en: 'Secondary 3' };

// The clashing save answers 409 ROOM_BOOKED on purpose.
test.use({
  expectedErrors: ['409 http://localhost:5173/api/v1/groups', 'status of 409 (Conflict)'],
});

test('owner adds a room, books a group in it, and a clashing group is refused', async ({
  page,
  lang,
  t,
}) => {
  // The dev database keeps every run's rooms, so each run uses its own room name.
  const room = `قاعة ${Math.floor(Math.random() * 1e8)}`;
  await signIn(page, t, STAFF.owner);
  await enterWorkspace(page, t, CENTER[lang]);

  await openNav(page, t, t.nav.rooms);
  await expect(page.getByRole('heading', { name: t.rooms.title })).toBeVisible();
  await page.getByLabel(t.rooms.name).fill(room);
  await page.getByLabel(`${t.groups.capacity} ${t.form.optional}`).fill('20');
  await page.getByRole('button', { name: t.rooms.add }).click();
  await expect(page.getByRole('list', { name: t.rooms.title }).getByText(room)).toBeVisible();

  // Two groups on the same default slot (Saturday 16:00–17:30) in that room.
  const newGroup = async () => {
    await page.goto('/groups/new');
    await choose(page, t.groups.subject, PHYSICS[lang]);
    await choose(page, t.groups.gradeLevel, SEC3[lang]);
    await choose(page, `${t.groups.room} ${t.form.optional}`, room);
    await page.getByRole('button', { name: t.groups.create }).click();
  };
  await newGroup();
  await expect(page).toHaveURL(/\/groups$/);
  await expect(page.getByRole('link').filter({ hasText: room })).toHaveCount(1);

  await newGroup();
  // "The room is taken on Saturday 4:00 PM – 5:30 PM by another group": the text before {day}.
  await expect(page.getByRole('alert')).toContainText(t.groups.roomBookedAt.split('{')[0]!.trim());
  await expect(page).toHaveURL(/\/groups\/new$/);
  await page.goto('/groups');
  await expect(page.getByRole('link').filter({ hasText: room })).toHaveCount(1);
  // Fits a 375 px phone: no sideways scroll.
  expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(375);
});
