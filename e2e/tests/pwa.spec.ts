import { expect, test } from './fixtures';

const token = 'x'.repeat(43);

test('in a browser tab the student app asks to install first (rule 13)', async ({ page, t }) => {
  await page.goto(`/s/activate/${token}`);
  await expect(page.getByRole('heading', { name: t.install.title })).toBeVisible();
  await expect(page.getByLabel(t.studentApp.email)).toHaveCount(0);
});

test('inside the app, a pasted invite link opens activation', async ({ page, t }) => {
  await page.addInitScript(() => localStorage.setItem('dafter.devInstalled', '1'));
  await page.goto('/s/login');
  const paste = page.getByLabel(t.install.paste);
  await paste.fill('hello');
  await expect(page.getByText(t.install.pasteInvalid)).toBeVisible();
  await paste.fill(`https://dafter.example/s/activate/${token}`);
  await page.getByRole('button', { name: t.install.activate }).click();
  await expect(page).toHaveURL(new RegExp(`/s/activate/${token}$`));
  await expect(page.getByRole('heading', { name: t.studentApp.activateTitle })).toBeVisible();
});
