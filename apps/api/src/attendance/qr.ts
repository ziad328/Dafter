import { createHmac, timingSafeEqual } from 'node:crypto';

export const WINDOW_MS = 10_000;

/**
 * Each session's QR key is derived from QR_SECRET and the session id, so it is never stored:
 * nothing to encrypt, and a database leak reveals no key.
 */
export const sessionKey = (secret: string, sessionId: string) =>
  createHmac('sha256', secret).update(`qr:${sessionId}`).digest();

export const windowAt = (ms: number) => Math.floor(ms / WINDOW_MS);

const mac = (key: Buffer, sessionId: string, window: number) =>
  createHmac('sha256', key).update(`${sessionId}.${window}`).digest().subarray(0, 16);

/** What the teacher's screen draws for one window (Day 13 computes the same in the browser). */
export const qrCode = (key: Buffer, sessionId: string, window: number) =>
  `${sessionId}.${window}.${mac(key, sessionId, window).toString('base64url')}`;

const FORMAT =
  /^([0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})\.(\d{1,15})\.([\w-]{22})$/;

/** The session id and window of a well-formed code, without checking its MAC. */
export function parseQr(code: string) {
  const m = FORMAT.exec(code);
  return m ? { sessionId: m[1]!, window: Number(m[2]), mac: m[3]! } : undefined;
}

export const macMatches = (key: Buffer, sessionId: string, window: number, given: string) =>
  timingSafeEqual(mac(key, sessionId, window), Buffer.from(given, 'base64url'));
