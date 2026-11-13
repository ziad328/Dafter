import { createHmac } from 'node:crypto';
import { describe, expect, it } from 'vitest';
import { toBase64url } from './base64url';
import { importQrKey, qrText } from './qr';

// The API checks codes with node:crypto (apps/api/src/attendance/qr.ts); the browser must agree.
describe('browser QR text', () => {
  it('matches the server HMAC for the same key, session and window', async () => {
    const raw = new Uint8Array(32).map((_, i) => i * 7);
    const id = '0b2a6f1e-6c1d-4a7e-9a1b-2c3d4e5f6a7b';
    const window = 178_000_123;
    const expected = createHmac('sha256', Buffer.from(raw))
      .update(`${id}.${window}`)
      .digest()
      .subarray(0, 16)
      .toString('base64url');
    const text = await qrText(await importQrKey(toBase64url(raw)), id, window);
    expect(text).toBe(`${id}.${window}.${expected}`);
  });
});
