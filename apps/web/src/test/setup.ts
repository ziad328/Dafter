import '@testing-library/jest-dom/vitest';
import { cleanup } from '@testing-library/react';
import { afterAll, afterEach, beforeAll, beforeEach } from 'vitest';
import { clearAccessToken, setWorkspaceId } from '@/api/base';
import { i18n } from '@/i18n';
import { sent, server } from './server';

beforeAll(() => server.listen({ onUnhandledFrame: 'error' }));
beforeEach(async () => {
  sent.length = 0;
  await i18n.changeLanguage('ar');
});
afterEach(() => {
  cleanup();
  server.resetHandlers();
  clearAccessToken();
  setWorkspaceId(null);
  localStorage.clear();
  document.documentElement.className = '';
});
afterAll(() => server.close());
