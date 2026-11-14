import { expect, test } from './fixtures';

// A fresh account per run, so the seeded staff keep the dev password other tests use.
test('staff resets a forgotten password from the emailed link', async ({ page, request, t }) => {
  const email = `reset-${Date.now()}-${Math.random().toString(36).slice(2, 8)}@example.com`;
  const res = await request.post('/api/v1/auth/register', {
    data: { name: 'منى حسن', email, password: 'old-password-1' },
  });
  expect(res.status()).toBe(201);

  await page.goto('/login');
  await page.getByRole('link', { name: t.auth.login.forgot }).click();
  // Retried: on a cold dev server Vite may reload the page as the lazy screen first loads,
  // which empties the field between fill and submit.
  await expect(async () => {
    await page.getByLabel(t.auth.forgot.email).fill(email);
    await page.getByRole('button', { name: t.auth.forgot.submit }).click();
    await expect(page.getByRole('status')).toHaveText(t.auth.forgot.sent, { timeout: 3000 });
  }).toPass({ timeout: 20_000 });

  const mail = await page.request.get(`/api/v1/dev/mail?to=${encodeURIComponent(email)}`);
  const link = ((await mail.json()) as { text: string }).text.match(
    /https?:\/\/\S+\/reset\/[\w-]+/,
  )![0];
  await page.goto(new URL(link).pathname);
  await page.getByLabel(t.auth.reset.password).fill('new-password-2');
  await page.getByRole('button', { name: t.auth.reset.submit }).click();
  await expect(page.getByRole('status')).toHaveText(t.auth.reset.done);

  await page.getByRole('link', { name: t.auth.forgot.back }).click();
  await page.getByLabel(t.auth.login.login).fill(email);
  await page.getByLabel(t.auth.login.password).fill('new-password-2');
  await page.getByRole('button', { name: t.auth.login.submit }).click();
  // A new account has no workspace yet.
  await expect(page).toHaveURL(/\/workspaces$/);
});
