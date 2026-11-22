import { describe, expect, it } from 'vitest';
import { smsParts } from './sms';

describe('smsParts', () => {
  it('counts Latin text in 160 / 153 and extension characters twice', () => {
    expect(smsParts('')).toEqual({ length: 0, parts: 0, unicode: false });
    expect(smsParts('a'.repeat(160))).toEqual({ length: 160, parts: 1, unicode: false });
    expect(smsParts('a'.repeat(161)).parts).toBe(2);
    expect(smsParts('a'.repeat(306)).parts).toBe(2);
    expect(smsParts('a'.repeat(307)).parts).toBe(3);
    expect(smsParts('{x}').length).toBe(5);
  });

  it('counts Arabic (or any non-GSM character) in 70 / 67', () => {
    expect(smsParts('ب'.repeat(70))).toEqual({ length: 70, parts: 1, unicode: true });
    expect(smsParts('ب'.repeat(71)).parts).toBe(2);
    expect(smsParts('ب'.repeat(134)).parts).toBe(2);
    expect(smsParts('ب'.repeat(135)).parts).toBe(3);
    expect(smsParts('ok 👍').unicode).toBe(true);
  });
});
