import { type CustomTemplates, DEFAULT_TEMPLATES, fillTemplate } from '@dafter/contracts';

/** Every trigger the outbox knows. */
export type Trigger =
  'absence' | 'session_cancelled' | 'session_moved' | 'exam_result' | 'fee_overdue';

/** The snapshot written by the enqueue functions in outbox.ts. */
export type MessagePayload = {
  startsAt: string;
  // A move: the start before it (missing on rows queued before this field).
  fromStartsAt?: string;
  timezone: string;
  centerAr: string;
  centerEn: string | null;
  subjectAr: string;
  subjectEn: string;
  // `id` is missing on rows queued before the send-time re-check.
  students: { id?: string; nameAr: string; nameEn: string | null }[];
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

/** The snapshot written by enqueueFeeOverdue. */
export type FeePayload = {
  period: string;
  centerAr: string;
  centerEn: string | null;
  students: { id?: string; nameAr: string; nameEn: string | null; balancePiastres: number }[];
};

type Payload = MessagePayload | ExamPayload | FeePayload;

type Locale = 'ar' | 'en';

const when = (p: MessagePayload, locale: Locale, at = p.startsAt) =>
  new Intl.DateTimeFormat(locale === 'ar' ? 'ar-EG-u-nu-latn' : 'en-GB', {
    timeZone: p.timezone,
    weekday: 'long',
    day: 'numeric',
    month: 'long',
    hour: 'numeric',
    minute: '2-digit',
    hour12: true,
  }).format(new Date(at));

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

// Whole pounds, as the web app shows money: "300 ج.م" / "EGP 300".
const egp = (piastres: number, locale: Locale) => {
  const n = new Intl.NumberFormat(locale === 'ar' ? 'ar-EG-u-nu-latn' : 'en-GB', {
    maximumFractionDigits: 2,
  }).format(piastres / 100);
  return locale === 'ar' ? `${n} ج.م` : `EGP ${n}`;
};

const month = (p: FeePayload, locale: Locale) =>
  new Intl.DateTimeFormat(locale === 'ar' ? 'ar-EG-u-nu-latn' : 'en-GB', {
    timeZone: 'UTC',
    month: 'long',
  }).format(new Date(`${p.period}-01T00:00:00Z`));

const owed = (p: FeePayload, locale: Locale) =>
  list(
    p.students.map((s) => `${name(s, locale)} ${egp(s.balancePiastres, locale)}`),
    locale,
  );

/** The placeholder values for one message, from its snapshot, in the guardian's language. */
function values(trigger: Trigger, p: Payload, locale: Locale): Record<string, string> {
  const center = locale === 'en' ? (p.centerEn ?? p.centerAr) : p.centerAr;
  if (trigger === 'exam_result') {
    const e = p as ExamPayload;
    const correction = e.corrected ? (locale === 'ar' ? 'تصحيح: ' : 'Correction: ') : '';
    const subject = locale === 'ar' ? e.subjectAr : e.subjectEn;
    return {
      center,
      correction,
      subject,
      title: e.title,
      date: day(e, locale),
      scores: scores(e, locale),
    };
  }
  if (trigger === 'fee_overdue') {
    const f = p as FeePayload;
    return { center, month: month(f, locale), due: owed(f, locale) };
  }
  // Cancel and move snapshots don't always carry the students (older rows have none).
  const m = { ...(p as MessagePayload), students: (p as MessagePayload).students ?? [] };
  return {
    center,
    subject: locale === 'ar' ? m.subjectAr : m.subjectEn,
    time: when(m, locale),
    from: m.fromStartsAt ? when(m, locale, m.fromStartsAt) : '',
    students: names(m, locale),
    wasWere: locale === 'ar' ? '' : m.students.length > 1 ? 'were' : 'was',
  };
}

// The move wording before it named the old time, for rows queued without `fromStartsAt`.
const MOVED_WITHOUT_FROM = {
  ar: '{center}: تم تغيير موعد حصة {subject} إلى {time}.',
  en: '{center}: the {subject} session has moved to {time}.',
};

/**
 * The message text: the center's own wording for this trigger and language when it has one,
 * else the default (`DEFAULT_TEMPLATES` in contracts, the same one the web preview uses). A move
 * queued without its old time can't fill `{from}`: it uses the center's text only if that has no
 * `{from}`, else the wording from before.
 */
export const render = (trigger: string, p: Payload, locale: Locale, custom?: CustomTemplates) => {
  const t = trigger as Trigger;
  const own = custom?.[t]?.[locale];
  const noFrom = t === 'session_moved' && !(p as MessagePayload).fromStartsAt;
  const text = noFrom
    ? own && !own.includes('{from}')
      ? own
      : MOVED_WITHOUT_FROM[locale]
    : own || DEFAULT_TEMPLATES[t][locale];
  return fillTemplate(text, values(t, p, locale));
};
