import { type ComponentType, lazy } from 'react';

const KEY = 'dafter.chunkReload';
// Within this window a second failure is a real outage, not a stale build: show the error.
const WINDOW_MS = 10_000;

/**
 * Recovers from a deploy: a page loaded before it asks for chunk files that no longer exist, so
 * the import fails. Reload once to get the new build; fail normally if that reload fails too.
 */
export function retryOnce<T>(load: () => Promise<T>): Promise<T> {
  return load().catch((err: unknown) => {
    let last = 0;
    try {
      last = Number(sessionStorage.getItem(KEY));
      if (Date.now() - last > WINDOW_MS) sessionStorage.setItem(KEY, String(Date.now()));
    } catch {
      // No storage (private mode): reload anyway; at worst the user sees the error after it.
    }
    if (Date.now() - last <= WINDOW_MS) throw err;
    window.location.reload();
    // Keep Suspense waiting until the page reloads.
    return new Promise<never>(() => {});
  });
}

/** React.lazy for a screen, with `retryOnce`. */
export const lazyPage = <T extends ComponentType>(load: () => Promise<{ default: T }>) =>
  lazy(() => retryOnce(load));
