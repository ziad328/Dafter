import { describe, expect, it } from 'vitest';
import { normalizeArabic } from '@dafter/contracts';

describe('normalizeArabic', () => {
  it.each([
    ['أحمد', 'احمد'],
    ['إسلام', 'اسلام'],
    ['آمنة', 'امنه'],
    ['فاطمة', 'فاطمه'],
    ['مُصْطَفَى', 'مصطفي'],
    ['محـــمد', 'محمد'],
    ['٠١٠١٢٣', '010123'],
    ['  Mona   ALI ', 'mona ali'],
  ])('%s → %s', (input, out) => expect(normalizeArabic(input)).toBe(out));
});
