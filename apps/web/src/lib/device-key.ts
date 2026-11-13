/**
 * The phone's device key: an ECDSA P-256 pair made with extractable = false, so the private key
 * can sign but can never be read or copied out. CryptoKey objects survive in IndexedDB as-is.
 * Day 14 moves this inside the installed PWA (rule 13); Day 12 signs check-ins with it.
 */
const DB = 'dafter';
const STORE = 'device';

interface Stored {
  pair: CryptoKeyPair;
}

function open() {
  return new Promise<IDBDatabase>((resolve, reject) => {
    const req = indexedDB.open(DB, 1);
    req.onupgradeneeded = () => req.result.createObjectStore(STORE);
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

async function run<T>(mode: IDBTransactionMode, fn: (s: IDBObjectStore) => IDBRequest<T>) {
  const db = await open();
  return new Promise<T>((resolve, reject) => {
    const req = fn(db.transaction(STORE, mode).objectStore(STORE));
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  }).finally(() => db.close());
}

const read = () => run<Stored | undefined>('readonly', (s) => s.get('key'));
const write = (v: Stored) => run('readwrite', (s) => s.put(v, 'key'));

/** The stored key, or a new one. */
export async function deviceKey(): Promise<CryptoKeyPair> {
  return (loading ??= load().finally(() => (loading = null))).then((s) => s.pair);
}

// Two callers at once must not each create (and store) a different key.
let loading: Promise<Stored> | null = null;

async function load(): Promise<Stored> {
  const existing = await read();
  if (existing) return existing;
  const pair = await crypto.subtle.generateKey({ name: 'ECDSA', namedCurve: 'P-256' }, false, [
    'sign',
    'verify',
  ]);
  const created = { pair };
  await write(created);
  return created;
}

/** SPKI, base64url: what POST /devices/bind expects. */
export async function publicKeySpki(pair: CryptoKeyPair) {
  const der = new Uint8Array(await crypto.subtle.exportKey('spki', pair.publicKey));
  return btoa(String.fromCharCode(...der))
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=+$/, '');
}
