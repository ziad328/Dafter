import {
  test as base,
  expect,
  type APIRequestContext,
  type Locator,
  type Page,
} from '@playwright/test';
// Direct JSON imports: Node ESM needs the attribute, and @dafter/i18n's index only works under Vite.
import ar from '../../packages/i18n/locales/ar/common.json' with { type: 'json' };
import en from '../../packages/i18n/locales/en/common.json' with { type: 'json' };

/** Seeded by `pnpm db:reset`; every staff user has the dev password. */
export const STAFF = { owner: '01000000001', teacher: '01000000002', assistant: '01000000003' };
export const PASSWORD = 'dafter-dev-123';

type Lang = 'ar' | 'en';

/**
 * `lang` and `t` follow the project (ar or en). Every test fails on an uncaught page error, a
 * console error or a failed request; signed out, POST /auth/refresh returns 401 by design.
 * A test that triggers an error on purpose lists it in `expectedErrors` (substrings).
 */
export const test = base.extend<{ lang: Lang; t: typeof ar; expectedErrors: string[] }>({
  expectedErrors: [[], { option: true }],
  // Playwright requires an object pattern as the first fixture argument.
  // eslint-disable-next-line no-empty-pattern
  lang: async ({}, use, testInfo) => use(testInfo.project.metadata.locale as Lang),
  t: async ({ lang }, use) => use({ ar, en }[lang]),
  page: async ({ page, lang, expectedErrors }, use) => {
    const problems: string[] = [];
    page.on('pageerror', (e) => problems.push(e.message));
    page.on('console', (m) => {
      if (m.type() === 'error' && !m.text().includes('401')) problems.push(m.text());
    });
    page.on('response', (r) => {
      if (r.status() >= 400 && !(r.status() === 401 && r.url().endsWith('/auth/refresh')))
        problems.push(`${r.status()} ${r.url()}`);
    });
    await page.addInitScript((l) => localStorage.setItem('dafter.locale', l), lang);
    await use(page);
    const overflow = await page.evaluate(
      () => document.documentElement.scrollWidth > document.documentElement.clientWidth,
    );
    expect(overflow, 'horizontal scroll at 375 px').toBe(false);
    expect(problems.filter((p) => !expectedErrors.some((e) => p.includes(e)))).toEqual([]);
  },
});

export { expect };

export async function signIn(page: Page, t: typeof ar, login: string) {
  await page.goto('/login');
  await page.getByLabel(t.auth.login.login).fill(login);
  await page.getByLabel(t.auth.login.password).fill(PASSWORD);
  await page.getByRole('button', { name: t.auth.login.submit }).click();
}

/**
 * Opens a staff screen from the navigation: a bottom tab on a phone, or through "More" for the
 * screens that live there (messages, staff, the fake phone).
 */
export async function openNav(page: Page, t: typeof ar, label: string) {
  const nav = page.getByRole('navigation', { name: t.nav.label });
  // The bar renders once the workspace has loaded; wait for it before asking what it holds.
  await nav.getByRole('link', { name: t.nav.more, exact: true }).waitFor();
  const link = nav.getByRole('link', { name: label, exact: true });
  if (await link.count()) return link.click();
  await nav.getByRole('link', { name: t.nav.more, exact: true }).click();
  await page.getByRole('main').getByRole('link', { name: label, exact: true }).click();
}

/** The header's workspace chip: its accessible name is "Switch workspace"; it shows the name. */
export const workspaceChip = (page: Page, t: typeof ar) =>
  page.getByRole('link', { name: t.nav.switchWorkspace });

/**
 * Picks an item in one of the app's dropdowns (a combobox named by its label, with a list of
 * options). `{ index }` counts real items, the placeholder not included.
 */
export async function choose(
  scope: Page | Locator,
  label: string,
  option: string | { index: number },
) {
  await scope.getByRole('combobox', { name: label, exact: true }).click();
  const page = 'page' in scope ? scope.page() : scope;
  const items = page.getByRole('option');
  await (
    typeof option === 'string' ? items.filter({ hasText: option }).first() : items.nth(option.index)
  ).click();
}

/**
 * Enters a workspace after sign-in: staff with one workspace land in it directly, staff with
 * several pick it from the list.
 */
export async function enterWorkspace(page: Page, t: typeof ar, name: string) {
  const button = page.getByRole('button', { name });
  const chip = workspaceChip(page, t);
  // The first sign-ins of a full parallel run wait on a cold dev server: 5 s is too tight there.
  await expect(button.or(chip).first()).toBeVisible({ timeout: 15_000 });
  if (await button.isVisible()) await button.click();
  await expect(chip).toContainText(name);
}

/** The owner's API in one workspace, for setting up data the screens under test then use. */
/** API calls as a seeded staff member (the owner unless `as` names another). */
export async function ownerApi(
  request: APIRequestContext,
  workspaceNameAr: string,
  as: string = STAFF.owner,
) {
  const login = await request.post('/api/v1/auth/login', {
    data: { login: as, password: PASSWORD },
  });
  const auth = { authorization: `Bearer ${(await login.json()).accessToken}` };
  const workspaces = (await (
    await request.get('/api/v1/workspaces', { headers: auth })
  ).json()) as { id: string; nameAr: string }[];
  const headers = {
    ...auth,
    'x-workspace-id': workspaces.find((w) => w.nameAr === workspaceNameAr)!.id,
  };
  return {
    get: async (url: string) => (await request.get(`/api/v1/${url}`, { headers })).json(),
    post: async (url: string, data?: object, extra?: Record<string, string>) =>
      (await request.post(`/api/v1/${url}`, { headers: { ...headers, ...extra }, data })).json(),
    put: async (url: string, data?: object) =>
      (await request.put(`/api/v1/${url}`, { headers, data })).json(),
    // The raw response, for a caller that checks the status.
    patch: (url: string, data?: object) => request.patch(`/api/v1/${url}`, { headers, data }),
  };
}
