import type { Page } from '@playwright/test';
import { expect, signIn, STAFF, test } from './fixtures';

/**
 * The browser going off and on line, as the app sees it. Not `context.setOffline`: in dev, Vite's
 * client reloads the page when its socket drops, which lands on Chrome's own offline page.
 */
const network = (page: Page, on: boolean) =>
  page.evaluate((online) => {
    Object.defineProperty(navigator, 'onLine', { get: () => online, configurable: true });
    window.dispatchEvent(new Event(online ? 'online' : 'offline'));
  }, on);

test('no network: the student app shows the offline screen, staff pages a banner', async ({
  page,
  t,
}) => {
  // The student app, before sign-in: the screen replaces the page.
  await page.goto('/s/login');
  await expect(page.getByRole('main')).toBeVisible();
  await network(page, false);
  await expect(page.getByRole('heading', { name: t.offline.title })).toBeVisible();
  await network(page, true);
  await expect(page.getByRole('heading', { name: t.offline.title })).toBeHidden();

  // Staff: the page stays, with a banner until the network is back.
  await signIn(page, t, STAFF.owner);
  await expect(page).not.toHaveURL(/\/login$/);
  await expect(page.getByRole('main')).toBeVisible();
  await network(page, false);
  await expect(page.getByText(t.offline.banner)).toBeVisible();
  await network(page, true);
  await expect(page.getByText(t.offline.banner)).toBeHidden();
});
