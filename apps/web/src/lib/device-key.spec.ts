import { afterEach, describe, expect, it } from 'vitest';
import { idb } from '@/test/idb';
import { fromBase64url } from './base64url';
import { deviceKey, publicKeySpki, signWithDevice } from './device-key';

afterEach(() => idb.clear());

describe('device key', () => {
  it('creates one key for concurrent callers, then reads it back', async () => {
    const [a, b] = await Promise.all([deviceKey(), deviceKey()]);
    expect(a).toBe(b);
    expect(a.privateKey.extractable).toBe(false);
    expect(await deviceKey()).toEqual(a);
  });

  it('exports the public key and signs text the public key verifies', async () => {
    const pair = await deviceKey();
    expect(fromBase64url(await publicKeySpki(pair)).length).toBe(91);
    const sig = fromBase64url(await signWithDevice(pair, 'code'));
    const ok = await crypto.subtle.verify(
      { name: 'ECDSA', hash: 'SHA-256' },
      pair.publicKey,
      sig,
      new TextEncoder().encode('code'),
    );
    expect(ok).toBe(true);
  });

  it('fails when storage fails, and recovers on the next call', async () => {
    idb.failNext();
    await expect(deviceKey()).rejects.toThrow('idb failed');
    await deviceKey();
    idb.failNext();
    await expect(deviceKey()).rejects.toThrow('idb failed');
  });
});
