import { render } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { Provider } from 'react-redux';
import { createMemoryRouter, RouterProvider } from 'react-router';
import { setWorkspaceId } from '@/api/base';
import { routes } from '@/App';
import { i18n } from '@/i18n';
import { makeStore } from '@/store';
import { fx } from './server';

/**
 * The whole app at `path`, with a fresh store and the network mocked by MSW. Staff are signed in
 * to «سنتر النور» unless `workspace: null`; `lang` switches before the first render.
 */
export async function renderAt(
  path: string,
  {
    workspace = fx.currentWorkspace.id,
    lang = 'ar',
  }: { workspace?: string | null; lang?: 'ar' | 'en' } = {},
) {
  await i18n.changeLanguage(lang);
  setWorkspaceId(workspace);
  const store = makeStore();
  const router = createMemoryRouter(routes, { initialEntries: [path] });
  const user = userEvent.setup();
  const view = render(
    <Provider store={store}>
      <RouterProvider router={router} />
    </Provider>,
  );
  return { ...view, user, router, store };
}

/** The current translation of a key, so tests read like the screen. */
export const tr = (key: string, options?: Record<string, unknown>) =>
  String(i18n.t(key as never, options as never));
