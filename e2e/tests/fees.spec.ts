import {
  choose,
  enterWorkspace,
  expect,
  ownerApi,
  PASSWORD,
  signIn,
  STAFF,
  test,
} from './fixtures';

const CENTER = { ar: 'سنتر النور', en: 'Al-Nour Center' };
const egp = (lang: 'ar' | 'en', pounds: number) =>
  new Intl.NumberFormat(lang === 'ar' ? 'ar-EG-u-nu-latn' : 'en', {
    style: 'currency',
    currency: 'EGP',
    minimumFractionDigits: pounds % 1 ? 2 : 0,
  }).format(pounds);

test('owner records a payment, prints its receipt, and reverses it', async ({
  page,
  request,
  lang,
  t,
}) => {
  // "Send" hands the receipt as text to the share sheet. Stubbed before load: Chrome on Linux has
  // no navigator.share, and the button picks Send or Copy when it renders.
  await page.addInitScript(() => {
    navigator.share = async (d) => void ((window as { shared?: ShareData }).shared = d);
  });
  // Data through the API: a 500 EGP monthly group and an enrolled student (billed on enroll).
  const login = await request.post('/api/v1/auth/login', {
    data: { login: STAFF.owner, password: PASSWORD },
  });
  const auth = { authorization: `Bearer ${(await login.json()).accessToken}` };
  const workspaces = (await (
    await request.get('/api/v1/workspaces', { headers: auth })
  ).json()) as {
    id: string;
    nameAr: string;
  }[];
  const headers = { ...auth, 'x-workspace-id': workspaces.find((w) => w.nameAr === CENTER.ar)!.id };
  const get = async (url: string) => (await request.get(`/api/v1/${url}`, { headers })).json();
  const post = async (url: string, data?: object) =>
    (await request.post(`/api/v1/${url}`, { headers, data })).json();
  const [subject] = await get('subjects');
  const [grade] = await get('grade-levels');
  const group = await post('groups', {
    force: true,
    subjectId: subject.id,
    gradeLevelId: grade.id,
    monthlyFeePiastres: 50_000,
    slots: [{ weekday: 1, startTime: '18:00', endTime: '19:30' }],
  });
  const n = String(Math.floor(Math.random() * 1e8)).padStart(8, '0');
  const student = await post('students', {
    nameAr: `نور ${n}`,
    gradeLevelId: grade.id,
    guardian: { phone: `011${n}`, relation: 'father', preferredLocale: 'ar', whatsappOptIn: false },
  });
  await post(`students/${student.id}/enrollments`, { groupId: group.id });

  await signIn(page, t, STAFF.owner);
  await enterWorkspace(page, t, CENTER[lang]);
  await page.goto(`/students/${student.id}`);
  const balance = page.getByTestId('balance');
  await expect(balance).toContainText(egp(lang, 500));

  // The student is in one group, so no group picker: amount, method, save.
  // The amount starts at what the student owes; the form opens in a sheet.
  await page.getByRole('button', { name: t.fees.record }).click();
  await expect(page.getByLabel(t.fees.amount)).toHaveValue(/^500(\.00)?$/);
  await page.getByLabel(t.fees.amount).fill('200');
  await choose(page, t.fees.method, t.fees.methods.vodafone_cash);
  await page.getByRole('button', { name: t.fees.save }).click();
  await expect(balance).toContainText(egp(lang, 300));

  await page.getByRole('link', { name: new RegExp(t.fees.receipt) }).click();
  await expect(page).toHaveURL(/\/receipts\//);
  // The student page can stay on screen while the receipt screen loads; wait for the receipt.
  await expect(page.getByRole('button', { name: t.receipt.print })).toBeVisible();
  await expect(page.getByText(`نور ${n}`)).toBeVisible();
  await expect(page.getByText(egp(lang, 200))).toBeVisible();
  await expect(page.getByText(t.fees.methods.vodafone_cash)).toBeVisible();
  await page.getByRole('button', { name: t.share.send }).click();
  const shared = await page.evaluate(() => (window as { shared?: ShareData }).shared?.text);
  expect(shared).toContain(`نور ${n}`);
  expect(shared).toContain(egp(lang, 200));

  await page.goBack();
  const payment = page.getByTestId('ledger').getByRole('listitem').filter({
    hasText: t.fees.methods.vodafone_cash,
  });
  await payment.getByRole('button', { name: t.fees.actions }).click();
  await payment.getByRole('button', { name: t.fees.reverse }).click();
  await payment.getByRole('button', { name: t.fees.confirmReverse }).click();
  await expect(balance).toContainText(egp(lang, 500));
  await expect(payment.getByText(t.fees.reversed)).toBeVisible();
});

test('a payment from Today: find the student, the amount is what they owe, save, receipt', async ({
  page,
  request,
  lang,
  t,
}) => {
  const { get, post } = await ownerApi(request, CENTER.ar);
  const [subject] = await get('subjects');
  const [grade] = await get('grade-levels');
  const group = await post('groups', {
    force: true,
    subjectId: subject.id,
    gradeLevelId: grade.id,
    monthlyFeePiastres: 40_000,
    slots: [{ weekday: 2, startTime: '17:00', endTime: '18:30' }],
  });
  const n = String(Math.floor(Math.random() * 1e8)).padStart(8, '0');
  const student = await post('students', {
    nameAr: `سلمى ${n}`,
    gradeLevelId: grade.id,
    guardian: { phone: `011${n}`, relation: 'mother', preferredLocale: 'ar', whatsappOptIn: false },
  });
  await post(`students/${student.id}/enrollments`, { groupId: group.id });

  await signIn(page, t, STAFF.owner);
  await enterWorkspace(page, t, CENTER[lang]);
  await page.getByRole('button', { name: t.today.recordPayment, exact: true }).click();
  const sheet = page.getByRole('dialog');
  await sheet.getByRole('searchbox', { name: t.students.search }).fill(`سلمى ${n}`);
  await sheet.getByRole('button', { name: new RegExp(n) }).click();
  await expect(sheet.getByTestId('balance')).toContainText(egp(lang, 400));
  await expect(sheet.getByLabel(t.fees.amount)).toHaveValue(/^400(\.00)?$/);
  await sheet.getByRole('button', { name: t.fees.save, exact: true }).click();
  await expect(sheet.getByText(t.payments.done.replace('{name}', `سلمى ${n}`))).toBeVisible();

  await sheet.getByRole('link', { name: new RegExp(t.fees.receipt) }).click();
  await expect(page).toHaveURL(/\/receipts\//);
  await expect(page.getByText(egp(lang, 400))).toBeVisible();
});
