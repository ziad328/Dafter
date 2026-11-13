import { describe, expect, it } from 'vitest';
import { macMatches, parseQr, qrCode, sessionKey, windowAt } from './qr.js';

const id = '0b2a6f1e-6c1d-4a7e-9a1b-2c3d4e5f6a7b';

describe('session QR', () => {
  it('round-trips a code and rejects another window or session', () => {
    const key = sessionKey('secret', id);
    const w = windowAt(Date.parse('2026-11-24T16:00:05Z'));
    const parsed = parseQr(qrCode(key, id, w))!;
    expect(parsed).toMatchObject({ sessionId: id, window: w });
    expect(macMatches(key, id, w, parsed.mac)).toBe(true);
    expect(macMatches(key, id, w + 1, parsed.mac)).toBe(false);
    expect(macMatches(sessionKey('secret', crypto.randomUUID()), id, w, parsed.mac)).toBe(false);
  });

  it('rejects malformed codes', () => {
    for (const bad of [
      '',
      'hello',
      `${id}.1`,
      `${id}.x.${'a'.repeat(22)}`,
      `${id}.1.${'a'.repeat(30)}`,
    ])
      expect(parseQr(bad)).toBeUndefined();
  });
});
