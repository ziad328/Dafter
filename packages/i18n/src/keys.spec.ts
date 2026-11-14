import { ERROR_CODES } from '@dafter/contracts';
import { describe, expect, it } from 'vitest';
import { defaultLocale, isLocale, locales, resources } from './index.js';

/** Dotted paths of every leaf, e.g. "shell.api.ok". */
function leaves(obj: object, prefix = ''): [string, unknown][] {
  return Object.entries(obj).flatMap(([k, v]) =>
    v && typeof v === 'object' ? leaves(v, `${prefix}${k}.`) : [[`${prefix}${k}`, v]],
  );
}

const keys = (locale: (typeof locales)[number]) =>
  leaves(resources[locale].common)
    .map(([k]) => k)
    .sort();

describe('i18n key check', () => {
  it('Arabic and English have the same keys', () => {
    expect(keys('en')).toEqual(keys('ar'));
  });

  it('every API error code has a translation', () => {
    for (const code of ERROR_CODES) expect(keys('ar')).toContain(`errors.${code}`);
  });

  it('no translation is empty', () => {
    for (const locale of locales) {
      const empty = leaves(resources[locale].common).filter(
        ([, v]) => typeof v !== 'string' || !v.trim(),
      );
      expect(empty, locale).toEqual([]);
    }
  });
});

describe('isLocale', () => {
  it('accepts only the supported locales, Arabic first', () => {
    expect(defaultLocale).toBe('ar');
    expect(isLocale('ar') && isLocale('en')).toBe(true);
    for (const bad of ['fr', 'AR', '', undefined, 1]) expect(isLocale(bad)).toBe(false);
  });
});
