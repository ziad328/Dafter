import { expect, signIn, STAFF, test, openNav } from './fixtures';

const CENTER = { ar: 'سنتر النور', en: 'Al-Nour Center' };
const PHYSICS = { ar: 'الفيزياء', en: 'Physics' };
const SEC3 = { ar: 'الصف الثالث الثانوي', en: 'Secondary 3' };
const SLOT = { ar: /4:00\sم – 5:30\sم/, en: /4:00\sPM – 5:30\sPM/ };

test('owner creates a group for a teacher', async ({ page, lang, t }) => {
  // The dev database is not reset between runs, so find this run's group by its capacity.
  const capacity = String(100 + Math.floor(Math.random() * 900));

  await signIn(page, t, STAFF.owner);
  await page.getByRole('button', { name: CENTER[lang] }).click();
  await openNav(page, t, t.nav.groups);
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
  await expect(card.getByRole('heading', { name: PHYSICS[lang] })).toBeVisible();
  await expect(card.getByText('منى حسن')).toBeVisible();
  await expect(card.getByText(SEC3[lang])).toBeVisible();
  // Slots read in 12-hour time.
  await expect(card.getByText(SLOT[lang])).toBeVisible();
});
