import {
  expect,
  PASSWORD,
  signIn,
  STAFF,
  test,
  openNav,
  workspaceChip,
  choose,
  enterWorkspace,
} from './fixtures';

const CENTER = { ar: 'سنتر النور', en: 'Al-Nour Center' };

test('owner invites an assistant by link, the assistant joins, and the owner picks their teacher', async ({
  page,
  browser,
  lang,
  t,
}) => {
  const n = String(Date.now()).slice(-8);
  const name = `هاني ${n}`;

  await signIn(page, t, STAFF.owner);
  await enterWorkspace(page, t, CENTER[lang]);
  await openNav(page, t, t.nav.staff);
  await choose(page, t.members.role, t.roles.assistant);
  await page.getByRole('button', { name: t.members.createLink }).click();
  const link = (await page.getByTestId('staff-invite-link').textContent())!;
  expect(link).toMatch(/\/invite\/[\w-]+$/);

  // The new assistant opens the link, creates an account, and joins.
  const ctx = await browser.newContext({ viewport: { width: 375, height: 812 } });
  await ctx.addInitScript((l) => localStorage.setItem('dafter.locale', l), lang);
  const a = await ctx.newPage();
  await a.goto(new URL(link).pathname);
  await a.getByRole('link', { name: t.auth.register.submit }).click();
  await a.getByLabel(t.auth.register.name).fill(name);
  await a.getByLabel(t.auth.register.phone).fill(`010${n}`);
  await a.getByLabel(t.auth.register.password).fill(PASSWORD);
  await a.getByRole('button', { name: t.auth.register.submit }).click();
  await a.getByRole('button', { name: t.invite.join }).click();
  await expect(workspaceChip(a, t)).toContainText(CENTER[lang]);
  await ctx.close();

  // Back on the owner's staff screen: the assistant is listed; tick the teacher they work for.
  await page.reload();
  const card = page.getByRole('listitem').filter({ hasText: name });
  await expect(card.getByText(t.roles.assistant, { exact: true })).toBeVisible();
  const teacher = card.getByRole('checkbox', { name: 'منى حسن' });
  await teacher.check();
  await expect(teacher).toBeChecked();
  await page.reload();
  await expect(teacher).toBeChecked();
});
