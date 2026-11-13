import { createPublicKey, verify } from 'node:crypto';
import { describe, expect, it } from 'vitest';
import { canonicalP256 } from './student-auth.service.js';

// The format contract Day 12's check-in relies on: a browser WebCrypto signature verifies in Node.
describe('device key', () => {
  it('verifies a WebCrypto ECDSA P-256 signature with node:crypto', async () => {
    const pair = await crypto.subtle.generateKey({ name: 'ECDSA', namedCurve: 'P-256' }, false, [
      'sign',
      'verify',
    ]);
    expect(pair.privateKey.extractable).toBe(false);
    const spki = Buffer.from(await crypto.subtle.exportKey('spki', pair.publicKey)).toString(
      'base64url',
    );
    const data = new TextEncoder().encode('session:window');
    const sig = await crypto.subtle.sign({ name: 'ECDSA', hash: 'SHA-256' }, pair.privateKey, data);

    const key = createPublicKey({
      key: Buffer.from(canonicalP256(spki), 'base64url'),
      format: 'der',
      type: 'spki',
    });
    // WebCrypto signs in raw r||s (IEEE P1363), not DER.
    const ok = verify('sha256', data, { key, dsaEncoding: 'ieee-p1363' }, Buffer.from(sig));
    expect(ok).toBe(true);
  });

  it('rejects a non-P-256 key', async () => {
    const rsa = await crypto.subtle.generateKey(
      {
        name: 'RSASSA-PKCS1-v1_5',
        modulusLength: 1024,
        publicExponent: new Uint8Array([1, 0, 1]),
        hash: 'SHA-256',
      },
      true,
      ['sign'],
    );
    const spki = Buffer.from(await crypto.subtle.exportKey('spki', rsa.publicKey)).toString(
      'base64url',
    );
    expect(() => canonicalP256(spki)).toThrow('DEVICE_KEY_INVALID');
  });
});
