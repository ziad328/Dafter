import { enterWorkspace, expect, openNav, ownerApi, signIn, STAFF, test } from './fixtures';

const CENTER = { ar: 'سنتر النور', en: 'Al-Nour Center' };

// A phone-only assistant forgot their password: the owner makes a link, the assistant uses it.
test('owner makes a password link for a phone-only assistant', async ({
  page,
  browser,
  request,
  lang,
  t,
}) => {
  const n = String(Math.floor(Math.random() * 1e8)).padStart(8, '0');
  const name = `سامح ${n}`;
  const phone = `015${n}`;
  const api = await ownerApi(request, CENTER.ar);
  const { token: inviteToken } = await api.post('invites', { role: 'assistant' });
  const reg = await request.post('/api/v1/auth/register', {
    data: { name, phone, password: 'forgotten-1' },
  });
  const auth = { authorization: `Bearer ${(await reg.json()).accessToken}` };
  expect(
    (await request.post(`/api/v1/invites/${inviteToken}/accept`, { headers: auth })).ok(),
  ).toBe(true);

  await signIn(page, t, STAFF.owner);
  await enterWorkspace(page, t, CENTER[lang]);
  await openNav(page, t, t.nav.staff);
  const title = t.members.resetFor.replace('{name}', name);
  await page.getByRole('button', { name: title }).click();
  const sheet = page.getByRole('dialog', { name: title });
  await sheet.getByRole('button', { name: t.members.createResetLink }).click();
  const link = (await sheet.getByTestId('staff-reset-link').textContent())!;
  expect(link).toMatch(/\/reset\/[\w-]+$/);

  const ctx = await browser.newContext({ viewport: { width: 375, height: 812 } });
  await ctx.addInitScript((l) => localStorage.setItem('dafter.locale', l), lang);
  const a = await ctx.newPage();
  await a.goto(new URL(link).pathname);
  await a.getByLabel(t.auth.reset.password).fill('remembered-2');
  await a.getByRole('button', { name: t.auth.reset.submit }).click();
  await expect(a.getByRole('status')).toHaveText(t.auth.reset.done);
  const login = await a.request.post('/api/v1/auth/login', {
    data: { login: phone, password: 'remembered-2' },
  });
  expect(login.status()).toBe(200);
  await ctx.close();
});
