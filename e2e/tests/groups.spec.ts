import { expect, signIn, STAFF, test } from './fixtures';

const CENTER = { ar: 'سنتر النور', en: 'Al-Nour Center' };
const PHYSICS = { ar: 'الفيزياء', en: 'Physics' };
const SEC3 = { ar: 'الصف الثالث الثانوي', en: 'Secondary 3' };

test('owner creates a group for a teacher', async ({ page, lang, t }) => {
  // The dev database is not reset between runs, so find this run's group by its capacity.
  const capacity = String(100 + Math.floor(Math.random() * 900));

  await signIn(page, t, STAFF.owner);
  await page.getByRole('button', { name: CENTER[lang] }).click();
  await page.getByRole('link', { name: t.home.groups }).click();
  await page.getByRole('link', { name: t.groups.new }).click();

  await page.getByLabel(t.groups.subject).selectOption({ label: PHYSICS[lang] });
  await page.getByLabel(t.groups.gradeLevel).selectOption({ label: SEC3[lang] });
  await page.getByLabel(t.groups.teacher).selectOption({ label: 'منى حسن' });
  await page.getByLabel(new RegExp(t.groups.capacity)).fill(capacity);
  await page.getByLabel(t.groups.start).fill('16:00');
  await page.getByLabel(t.groups.end).fill('17:30');
  await page.getByRole('button', { name: t.groups.create }).click();

  await expect(page).toHaveURL(/\/groups$/);
  const card = page.getByRole('link').filter({ hasText: capacity });
  await expect(
    card.getByRole('heading', { name: `${PHYSICS[lang]} · ${SEC3[lang]}` }),
  ).toBeVisible();
  await expect(card.getByText('منى حسن')).toBeVisible();
  await expect(card.getByText('16:00–17:30')).toBeVisible();
});
