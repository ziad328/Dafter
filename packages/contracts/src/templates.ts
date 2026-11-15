import * as z from 'zod';
import { messageTrigger } from './messages.js';

type Trigger = z.infer<typeof messageTrigger>;
type Locale = 'ar' | 'en';

/**
 * The placeholders each trigger's text may use. The API fills them from the message's snapshot;
 * the web app fills them with sample values for the preview. `wasWere` is English grammar
 * ("was" for one student, "were" for siblings) and empty in Arabic.
 */
export const TEMPLATE_PLACEHOLDERS: Record<Trigger, readonly string[]> = {
  absence: ['center', 'students', 'subject', 'time', 'wasWere'],
  session_cancelled: ['center', 'subject', 'time'],
  // from: the session's time before the move.
  session_moved: ['center', 'subject', 'from', 'time'],
  exam_result: ['center', 'correction', 'subject', 'title', 'date', 'scores'],
  fee_overdue: ['center', 'month', 'due'],
};

/** The wording a center gets until it writes its own (the v0 wording, except a move now names the old time). */
export const DEFAULT_TEMPLATES: Record<Trigger, Record<Locale, string>> = {
  absence: {
    ar: '{center}: نود إبلاغكم بغياب {students} عن حصة {subject} ({time}).',
    en: '{center}: {students} {wasWere} absent from {subject} ({time}).',
  },
  session_cancelled: {
    ar: '{center}: تم إلغاء حصة {subject} ({time}).',
    en: '{center}: the {subject} session ({time}) is cancelled.',
  },
  session_moved: {
    ar: '{center}: حصة {subject} {from} أصبحت {time}.',
    en: '{center}: the {subject} session on {from} has moved to {time}.',
  },
  exam_result: {
    ar: '{center}: {correction}نتيجة امتحان {subject} «{title}» ({date}): {scores}.',
    en: '{center}: {correction}{subject} exam "{title}" ({date}): {scores}.',
  },
  fee_overdue: {
    ar: '{center}: تذكير بمصروفات شهر {month}، المتبقي على {due}.',
    en: '{center}: a reminder for {month} fees. Still due: {due}.',
  },
};

const PLACEHOLDER = /\{(\w+)\}/g;

/**
 * Fills `{name}` placeholders in one pass, so a value that looks like a placeholder (a student
 * named «{center}») is never expanded again. Unknown names stay as typed.
 */
export const fillTemplate = (text: string, values: Record<string, string>) =>
  text.replace(PLACEHOLDER, (match, key: string) => values[key] ?? match);

/**
 * The first `{…}` in `text` that isn't one of `trigger`'s placeholders, if any. Anything in braces
 * counts, so a mistyped "{ center }" is refused rather than sent to parents as typed.
 */
export const unknownPlaceholder = (trigger: Trigger, text: string) =>
  [...text.matchAll(/\{([^{}]*)\}/g)]
    .map((m) => m[1]!)
    .find((key) => !TEMPLATE_PLACEHOLDERS[trigger].includes(key));

// Trimmed; empty or null = back to the default wording.
const customText = z.string().trim().max(500).nullable();

/** Owner: one trigger's wording in both languages. */
export const updateMessageTemplateRequest = z
  .object({ ar: customText, en: customText })
  .meta({ id: 'UpdateMessageTemplateRequest' });

const localeText = z.object({ default: z.string(), custom: z.string().nullable() });

export const messageTemplate = z
  .object({
    trigger: messageTrigger,
    placeholders: z.array(z.string()),
    ar: localeText,
    en: localeText,
  })
  .meta({ id: 'MessageTemplate' });

export const messageTemplateList = z.array(messageTemplate).meta({ id: 'MessageTemplateList' });

/** Custom wording stored in `workspaces.settings.templates`. */
export type CustomTemplates = Partial<Record<Trigger, Partial<Record<Locale, string | null>>>>;
export type UpdateMessageTemplateRequest = z.infer<typeof updateMessageTemplateRequest>;
export type MessageTemplate = z.infer<typeof messageTemplate>;
