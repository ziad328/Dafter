import { fromBase64url, toBase64url } from './base64url';

/** The HMAC key from POST /sessions/:id/open; it can sign but never leaves the page. */
export const importQrKey = (qrKey: string) =>
  crypto.subtle.importKey('raw', fromBase64url(qrKey), { name: 'HMAC', hash: 'SHA-256' }, false, [
    'sign',
  ]);

/** Same format as the API's qr.ts: `${sessionId}.${window}.${first 16 bytes of the HMAC}`. */
export async function qrText(key: CryptoKey, sessionId: string, window: number) {
  const mac = await crypto.subtle.sign(
    'HMAC',
    key,
    new TextEncoder().encode(`${sessionId}.${window}`),
  );
  return `${sessionId}.${window}.${toBase64url(new Uint8Array(mac).subarray(0, 16))}`;
}
