import { defaultLocale, isLocale, type Locale, resources } from '@dafter/i18n';
import i18n from 'i18next';
import ICU from 'i18next-icu';
import { initReactI18next } from 'react-i18next';

const STORAGE_KEY = 'dafter.locale';

function savedLocale(): Locale {
  try {
    const value = localStorage.getItem(STORAGE_KEY);
    return isLocale(value) ? value : defaultLocale;
  } catch {
    return defaultLocale;
  }
}

// <html lang dir> drives RTL for every component (logical Tailwind classes, Radix).
i18n.on('languageChanged', (lng) => {
  document.documentElement.lang = lng;
  document.documentElement.dir = i18n.dir(lng);
  try {
    localStorage.setItem(STORAGE_KEY, lng);
  } catch {
    // Private mode or blocked storage: the choice just won't be remembered.
  }
});

void i18n
  .use(ICU)
  .use(initReactI18next)
  .init({
    resources,
    lng: savedLocale(),
    fallbackLng: defaultLocale,
    defaultNS: 'common',
    interpolation: { escapeValue: false },
  });

export { i18n };
