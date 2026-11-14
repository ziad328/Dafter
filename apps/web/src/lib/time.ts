/** Dates here are local calendar dates in the workspace timezone, "YYYY-MM-DD". */

const DAY_MS = 86_400_000;

/** Intl locale with Western digits, as in the i18n rules. */
export const intlLocale = (lang: string) => (lang === 'ar' ? 'ar-EG-u-nu-latn' : 'en');

// en-CA formats as YYYY-MM-DD and en-GB with h23 as HH:MM, whatever the UI language.
export const localDate = (at: string | Date, timeZone: string) =>
  new Intl.DateTimeFormat('en-CA', { timeZone }).format(new Date(at));

export const localTime = (at: string | Date, timeZone: string) =>
  new Intl.DateTimeFormat('en-GB', {
    timeZone,
    hour: '2-digit',
    minute: '2-digit',
    hourCycle: 'h23',
  }).format(new Date(at));

/** "4:00 م" / "4:00 PM" for people; `localTime` stays 24-hour for form values. */
export const displayTime = (at: string | Date, timeZone: string, lang: string) =>
  new Intl.DateTimeFormat(intlLocale(lang), {
    timeZone,
    hour: 'numeric',
    minute: '2-digit',
    hour12: true,
  }).format(new Date(at));

/** A weekly slot's "HH:MM" (no date) shown the same way. */
export const clockLabel = (hhmm: string, lang: string) =>
  displayTime(`1970-01-01T${hhmm}:00Z`, 'UTC', lang);

export const addDays = (date: string, n: number) =>
  new Date(Date.parse(date) + n * DAY_MS).toISOString().slice(0, 10);

/** The Saturday on or before `date`: the Egyptian week starts on Saturday. */
export const weekStart = (date: string) =>
  addDays(date, -((new Date(Date.parse(date)).getUTCDay() + 1) % 7));

/** "السبت 21 نوفمبر" / "Saturday 21 November". */
export const dayLabel = (date: string, lang: string) =>
  new Intl.DateTimeFormat(intlLocale(lang), {
    weekday: 'long',
    day: 'numeric',
    month: 'long',
    timeZone: 'UTC',
  }).format(Date.parse(date));
