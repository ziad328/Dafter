import '@testing-library/jest-dom/vitest';
import { cleanup, configure } from '@testing-library/react';
import { afterAll, afterEach, beforeAll, beforeEach } from 'vitest';
import { clearAccessToken, setWorkspaceId } from '@/api/base';
import { i18n } from '@/i18n';
import { fakeIndexedDb } from './idb';
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

// Browser APIs jsdom lacks; a test that needs another answer overrides them.
window.matchMedia = (query: string) =>
  ({
    matches: false,
    media: query,
    addEventListener: () => {},
    removeEventListener: () => {},
  }) as unknown as MediaQueryList;
HTMLDialogElement.prototype.showModal = function () {
  this.setAttribute('open', '');
};
HTMLDialogElement.prototype.close = function () {
  if (!this.open) return;
  this.removeAttribute('open');
  this.dispatchEvent(new Event('close'));
};
// Radix Select measures and captures the pointer.
Element.prototype.hasPointerCapture = () => false;
Element.prototype.releasePointerCapture = () => {};
Element.prototype.scrollIntoView = () => {};
// The full suite runs files in parallel; give slow renders (QR, lazy screens) more than 1 s.
configure({ asyncUtilTimeout: 5000 });
// jsdom has no IndexedDB; the device key lives there.
Object.assign(globalThis, { indexedDB: fakeIndexedDb });
