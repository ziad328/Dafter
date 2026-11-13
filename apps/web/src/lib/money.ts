import { normalizeArabic } from '@dafter/contracts';
import { intlLocale } from './time';

// Same cap as the API contract (100,000 EGP), so the form flags it instead of the server.
const MAX_PIASTRES = 10_000_000;

/**
 * "150.5" or "١٥٠٫٥" EGP -> 15050 piastres, by string, never through a float. Undefined when it
 * is not a positive amount with at most 2 decimals, or above the cap.
 */
export function toPiastres(text: string): number | undefined {
  const m = /^(\d{1,7})(?:[.,٫](\d{1,2}))?$/.exec(normalizeArabic(text).trim());
  if (!m) return undefined;
  const piastres = Number(m[1]) * 100 + Number((m[2] ?? '').padEnd(2, '0'));
  return piastres > 0 && piastres <= MAX_PIASTRES ? piastres : undefined;
}

/** 15050 -> "150.50", for an input's default value. */
export const egpText = (piastres: number) =>
  `${Math.trunc(piastres / 100)}.${String(Math.abs(piastres) % 100).padStart(2, '0')}`;

/** Display only: "‏150٫50 ج.م.‏" / "EGP 150.50". */
export const formatEgp = (piastres: number, lang: string) =>
  new Intl.NumberFormat(intlLocale(lang), { style: 'currency', currency: 'EGP' }).format(
    piastres / 100,
  );
