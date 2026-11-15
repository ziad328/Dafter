/** Every trigger the outbox knows. */
export type Trigger = 'absence' | 'session_cancelled' | 'session_moved' | 'exam_result';

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

/** The snapshot written by enqueueExamResults. */
export type ExamPayload = {
  title: string;
  heldOn: string;
  maxScore: number;
  // A resend after a score was fixed (missing on rows queued before this field).
  corrected?: boolean;
  centerAr: string;
  centerEn: string | null;
  subjectAr: string;
  subjectEn: string;
  students: { nameAr: string; nameEn: string | null; score: number | null; absent: boolean }[];
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

const name = (s: { nameAr: string; nameEn: string | null }, locale: Locale) =>
  locale === 'en' ? (s.nameEn ?? s.nameAr) : s.nameAr;

const list = (items: string[], locale: Locale) =>
  new Intl.ListFormat(locale, { type: 'conjunction' }).format(items);

const names = (p: MessagePayload, locale: Locale) =>
  list(
    p.students.map((s) => name(s, locale)),
    locale,
  );

// A plain date: format it in UTC so the day never shifts.
const day = (p: ExamPayload, locale: Locale) =>
  new Intl.DateTimeFormat(locale === 'ar' ? 'ar-EG-u-nu-latn' : 'en-GB', {
    timeZone: 'UTC',
    day: 'numeric',
    month: 'long',
  }).format(new Date(`${p.heldOn}T00:00:00Z`));

const scores = (p: ExamPayload, locale: Locale) =>
  list(
    p.students.map((s) =>
      s.absent
        ? `${name(s, locale)} ${locale === 'ar' ? 'غائب' : 'absent'}`
        : `${name(s, locale)} ${s.score}/${p.maxScore}`,
    ),
    locale,
  );

// Fixed wording per trigger and language (v0); a center only switches triggers on or off.
type Templates = {
  [T in Trigger]: Record<
    Locale,
    (p: T extends 'exam_result' ? ExamPayload : MessagePayload) => string
  >;
};

const templates: Templates = {
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
  exam_result: {
    ar: (p) =>
      `${p.centerAr}: ${p.corrected ? 'تصحيح: ' : ''}نتيجة امتحان ${p.subjectAr} «${p.title}» (${day(p, 'ar')}): ${scores(p, 'ar')}.`,
    en: (p) =>
      `${p.centerEn ?? p.centerAr}: ${p.corrected ? 'Correction: ' : ''}${p.subjectEn} exam "${p.title}" (${day(p, 'en')}): ${scores(p, 'en')}.`,
  },
};

export const render = (trigger: string, p: MessagePayload | ExamPayload, locale: Locale) =>
  (templates[trigger as Trigger][locale] as (p: MessagePayload | ExamPayload) => string)(p);
