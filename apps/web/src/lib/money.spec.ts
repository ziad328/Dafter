import { describe, expect, it } from 'vitest';
import { egpText, toPiastres } from './money';

describe('money input', () => {
  it('turns EGP text into whole piastres without floats', () => {
    expect(toPiastres('150')).toBe(15000);
    expect(toPiastres('150.5')).toBe(15050);
    expect(toPiastres('0.07')).toBe(7);
    expect(toPiastres('١٥٠٫٥')).toBe(15050);
    // 0.1 + 0.2 style float errors cannot happen: 99999.99 is exact.
    expect(toPiastres('99999.99')).toBe(9_999_999);
  });

  it('rejects zero, negatives, 3 decimals, text and amounts above the API cap', () => {
    for (const bad of ['', '0', '-5', '1.234', 'abc', '1e3', '100000.01'])
      expect(toPiastres(bad)).toBeUndefined();
  });

  it('formats piastres back for an input', () => {
    expect(egpText(15050)).toBe('150.50');
    expect(egpText(7)).toBe('0.07');
  });
});
