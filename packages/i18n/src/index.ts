import ar from '../locales/ar/common.json';
import en from '../locales/en/common.json';

export const locales = ['ar', 'en'] as const;
export type Locale = (typeof locales)[number];
export const defaultLocale: Locale = 'ar';

export const isLocale = (value: unknown): value is Locale =>
  typeof value === 'string' && (locales as readonly string[]).includes(value);

/** Arabic is the source of truth for the key set; the i18n check keeps English identical. */
export const resources = {
  ar: { common: ar },
  en: { common: en },
} as const;
