import { enterWorkspace, expect, freshCenter, signIn, STAFF, test } from './fixtures';

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
