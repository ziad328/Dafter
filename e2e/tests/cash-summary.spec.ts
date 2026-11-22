import {
  choose,
  enterWorkspace,
  expect,
  freshCenter,
  openNav,
  ownerApi,
  signIn,
  STAFF,
  test,
} from './fixtures';

test("assistant hands over today's cash summary, and the owner sees it", async ({
  page,
  request,
  t,
}) => {
  // The teacher's group and a student, then a cash payment taken by the assistant.
  const c = await freshCenter(request, 'سنتر التسليم', ['teacher', 'assistant']);
  const { subject, grade } = c;
  const teacher = await ownerApi(request, c.name, STAFF.teacher);
  const group = await teacher.post('groups', {
    subjectId: subject.id,
    gradeLevelId: grade.id,
    monthlyFeePiastres: 30_000,
    slots: [{ weekday: 2, startTime: '19:00', endTime: '20:00' }],
  });
  const n = String(Math.floor(Math.random() * 1e8)).padStart(8, '0');
  const owner = c.api;
  const student = await owner.post('students', {
    nameAr: `دافع ${n}`,
    gradeLevelId: grade.id,
    guardian: { phone: `011${n}`, relation: 'father', preferredLocale: 'ar', whatsappOptIn: false },
  });
  await owner.post(`students/${student.id}/enrollments`, { groupId: group.id });
  const assistant = await ownerApi(request, c.name, STAFF.assistant);
  const payment = await assistant.post(
    'payments',
    { studentId: student.id, groupId: group.id, amountPiastres: 30_000, method: 'cash' },
    { 'idempotency-key': crypto.randomUUID() },
  );
  expect(payment.receiptNo).toBeGreaterThan(0);

  await signIn(page, t, STAFF.assistant);
  await enterWorkspace(page, t, c.name);
  await openNav(page, t, t.nav.cashSummary);
  await expect(page).toHaveURL(/\/cash-summary$/);
  await expect(page.getByRole('heading', { name: t.cashSummary.title })).toBeVisible();
  // Only the assistant's own section.
  await expect(page.getByRole('region')).toHaveCount(1);
  const row = page.getByRole('row', { name: new RegExp(`دافع ${n}`) });
  await expect(row).toContainText(String(payment.receiptNo));
  await expect(row).toContainText(t.fees.methods.cash);
  await expect(page.getByRole('button', { name: t.receipt.print })).toBeVisible();
  // Fits a 375 px phone: no sideways scroll.
  expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(375);

  await page.context().clearCookies();
  await signIn(page, t, STAFF.owner);
  await enterWorkspace(page, t, c.name);
  await page.goto('/cash-summary');
  await expect(page.getByRole('row', { name: new RegExp(`دافع ${n}`) })).toBeVisible();
  expect(await page.getByRole('region').count()).toBeGreaterThanOrEqual(2);

  // The owner picks the assistant over the last week: only their section, with the payment.
  const members = await owner.get('members');
  const helper = members.find((m: { role: string }) => m.role === 'assistant');
  await choose(page, t.cashSummary.person, helper.name);
  await expect(page.getByRole('region')).toHaveCount(1);
  await expect(page.getByRole('region', { name: helper.name })).toBeVisible();
  const today = await page.getByLabel(t.cashSummary.day).inputValue();
  const weekAgo = new Date(Date.parse(today) - 6 * 86_400_000).toISOString().slice(0, 10);
  await page.getByLabel(t.cashSummary.to).fill(today);
  await page.getByLabel(t.cashSummary.day).fill(weekAgo);
  await expect(page.getByLabel(t.cashSummary.day)).toHaveValue(weekAgo);
  await expect(page.getByRole('row', { name: new RegExp(`دافع ${n}`) })).toBeVisible();
});
