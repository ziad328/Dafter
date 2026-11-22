import { enterWorkspace, expect, freshCenter, openNav, signIn, STAFF, test } from './fixtures';

test('a center with more than 50 students shows the rest on «show more»', async ({
  page,
  request,
  lang,
  t,
}) => {
  test.setTimeout(60_000);
  const c = await freshCenter(request, 'سنتر الصفحات');
  const n = String(Math.floor(Math.random() * 1e6)).padStart(6, '0');
  // Created oldest first; the list shows newest first, so the first one is on page two.
  for (let i = 0; i < 51; i++)
    await c.api.post('students', {
      nameAr: `طالب ${n} ${String(i).padStart(2, '0')}`,
      gradeLevelId: c.grade.id,
      guardian: {
        phone: `014${n}${String(i).padStart(2, '0')}`,
        relation: 'mother',
        preferredLocale: lang,
        whatsappOptIn: false,
      },
    });

  await signIn(page, t, STAFF.owner);
  await enterWorkspace(page, t, c.name);
  await openNav(page, t, t.nav.students);
  await expect(page.getByText(`طالب ${n} 50`)).toBeVisible();
  await expect(page.getByText(`طالب ${n} 00`)).toBeHidden();
  await page.getByRole('button', { name: t.list.more }).click();
  await expect(page.getByText(`طالب ${n} 00`)).toBeVisible();
  await expect(page.getByRole('button', { name: t.list.more })).toBeHidden();
});
