/** Every trigger the outbox knows. */
export type Trigger = 'absence' | 'session_cancelled' | 'session_moved';

/** The snapshot written by the enqueue functions in outbox.ts. */
export type MessagePayload = {
  startsAt: string;
  timezone: string;
  centerAr: string;
  centerEn: string | null;
  subjectAr: string;
  subjectEn: string;
  students: { nameAr: string; nameEn: string | null }[];
};

type Locale = 'ar' | 'en';

const when = (p: MessagePayload, locale: Locale) =>
  new Intl.DateTimeFormat(locale === 'ar' ? 'ar-EG-u-nu-latn' : 'en-GB', {
    timeZone: p.timezone,
    weekday: 'long',
    day: 'numeric',
    month: 'long',
    hour: 'numeric',
    minute: '2-digit',
    hour12: true,
  }).format(new Date(p.startsAt));

const names = (p: MessagePayload, locale: Locale) =>
  new Intl.ListFormat(locale, { type: 'conjunction' }).format(
    p.students.map((s) => (locale === 'en' ? (s.nameEn ?? s.nameAr) : s.nameAr)),
  );

// Fixed wording per trigger and language (v0); a center only switches triggers on or off.
const templates: Record<Trigger, Record<Locale, (p: MessagePayload) => string>> = {
  absence: {
    ar: (p) =>
      `${p.centerAr}: نود إبلاغكم بغياب ${names(p, 'ar')} عن حصة ${p.subjectAr} (${when(p, 'ar')}).`,
    en: (p) =>
      `${p.centerEn ?? p.centerAr}: ${names(p, 'en')} ${p.students.length > 1 ? 'were' : 'was'} absent from ${p.subjectEn} (${when(p, 'en')}).`,
  },
  session_cancelled: {
    ar: (p) => `${p.centerAr}: تم إلغاء حصة ${p.subjectAr} (${when(p, 'ar')}).`,
    en: (p) =>
      `${p.centerEn ?? p.centerAr}: the ${p.subjectEn} session (${when(p, 'en')}) is cancelled.`,
  },
  session_moved: {
    ar: (p) => `${p.centerAr}: تم تغيير موعد حصة ${p.subjectAr} إلى ${when(p, 'ar')}.`,
    en: (p) =>
      `${p.centerEn ?? p.centerAr}: the ${p.subjectEn} session has moved to ${when(p, 'en')}.`,
  },
};

export const render = (trigger: string, p: MessagePayload, locale: Locale) =>
  templates[trigger as Trigger][locale](p);
