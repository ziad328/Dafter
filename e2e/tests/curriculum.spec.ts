import { enterWorkspace, expect, openNav, signIn, STAFF, test } from './fixtures';

const CENTER = { ar: 'سنتر النور', en: 'Al-Nour Center' };

test('owner adds a subject, picks it for a group, then archives it', async ({ page, lang, t }) => {
  // The dev database keeps every run's subjects, so each run uses its own name.
  const n = Math.floor(Math.random() * 1e8);
  const subject = { ar: `البرمجة ${n}`, en: `Programming ${n}` };
  await signIn(page, t, STAFF.owner);
  await enterWorkspace(page, t, CENTER[lang]);

  await openNav(page, t, t.nav.curriculum);
  await expect(page.getByRole('heading', { name: t.curriculum.title })).toBeVisible();
  const list = page.getByRole('list', { name: t.curriculum.subjects });
  await expect(list.getByRole('listitem').first()).toBeVisible();
  await page.getByRole('button', { name: t.curriculum.addSubject }).click();
  const sheet = page.getByRole('dialog', { name: t.curriculum.addSubject });
  await sheet.getByLabel(t.curriculum.nameAr).fill(subject.ar);
  await sheet.getByLabel(`${t.curriculum.nameEn} ${t.form.optional}`).fill(subject.en);
  await sheet.getByRole('button', { name: t.curriculum.addSubject }).click();
  await expect(sheet).toBeHidden();
  await expect(list.getByText(subject[lang])).toBeVisible();
  // Fits a 375 px phone: no sideways scroll.
  expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(375);

  // The new subject is offered on the new-group form.
  const subjectOptions = async () => {
    await page.goto('/groups/new');
    await page.getByRole('combobox', { name: t.groups.subject, exact: true }).click();
    const options = page.getByRole('option');
    await expect(options.first()).toBeVisible();
    const names = await options.allTextContents();
    await page.keyboard.press('Escape');
    return names;
  };
  expect(await subjectOptions()).toContain(subject[lang]);

  // Archived, it stays in the list (marked) but is no longer offered.
  await page.goto('/curriculum');
  await list
    .getByRole('button', { name: t.curriculum.actions.replace('{name}', subject[lang]) })
    .click();
  await list.getByRole('button', { name: t.curriculum.archive }).click();
  const row = list.getByRole('listitem').filter({ hasText: subject[lang] });
  await expect(row).toContainText(t.curriculum.archived);
  expect(await subjectOptions()).not.toContain(subject[lang]);
});
