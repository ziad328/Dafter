/**
 * The little of IndexedDB that lib/device-key.ts uses (open, one store, get and put), in memory.
 * jsdom has none; CryptoKey objects are stored as-is, as the browser does. `failNext` makes the
 * next request fail, for the error paths.
 */
type Req<T> = {
  result?: T;
  error?: Error;
  onsuccess?: () => void;
  onerror?: () => void;
  onupgradeneeded?: () => void;
};

const data = new Map<string, unknown>();
let failing = false;

function request<T>(run: () => T, upgrade = false): Req<T> {
  const req: Req<T> = {};
  setTimeout(() => {
    if (failing) {
      failing = false;
      req.error = new Error('idb failed');
      return req.onerror?.();
    }
    req.result = run();
    if (upgrade) req.onupgradeneeded?.();
    req.onsuccess?.();
  });
  return req;
}

const store = {
  get: (key: string) => request(() => data.get(key)),
  put: (value: unknown, key: string) => request(() => (data.set(key, value), key)),
};
const db = {
  createObjectStore: () => store,
  transaction: () => ({ objectStore: () => store }),
  close: () => {},
};

export const fakeIndexedDb = { open: () => request(() => db, data.size === 0) };

export const idb = {
  clear: () => data.clear(),
  failNext: () => {
    failing = true;
  },
};
