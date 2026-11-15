import * as z from 'zod';

/** A parent message the provider has sent (the fake-phone page shows these per guardian). */
export const sentMessage = z
  .object({
    id: z.uuid(),
    // For a teacher, masked except the last 3 digits (•••••••123).
    phone: z.string(),
    guardianName: z.string().nullable(),
    locale: z.enum(['ar', 'en']),
    body: z.string(),
    sentAt: z.iso.datetime(),
  })
  .meta({ id: 'SentMessage' });

export const sentMessageList = z.array(sentMessage).meta({ id: 'SentMessageList' });

export type SentMessage = z.infer<typeof sentMessage>;

export const messageTrigger = z.enum([
  'absence',
  'session_cancelled',
  'session_moved',
  'exam_result',
  'fee_overdue',
]);
// skipped: re-checked at send time and no longer true (see skipReason); never sent.
export const messageStatus = z.enum(['queued', 'sent', 'failed', 'skipped']);
// paid: every child's balance was zero; trigger_off: the center switched the message off since;
// not_absent: every child was marked present (or excused) after the session closed.
export const skipReason = z.enum(['paid', 'trigger_off', 'not_absent']);

/**
 * Per-workspace switches: which events message parents. All default to on, except the monthly
 * fee reminder (money texts wait until the center turns them on).
 */
export const messageSettings = z
  .object({
    absence: z.boolean(),
    sessionChange: z.boolean(),
    examResult: z.boolean(),
    feeOverdue: z.boolean(),
    // Only the primary guardian of each student gets messages (default off: every guardian).
    // A default, so a save from a page loaded before this switch existed still validates.
    primaryOnly: z.boolean().default(false),
  })
  .meta({ id: 'MessageSettings' });

export const listMessagesQuery = z
  .object({ status: messageStatus.optional() })
  .meta({ id: 'ListMessagesQuery' });

/** One row of the message log (owner and assistant). */
export const outboxMessage = z
  .object({
    id: z.uuid(),
    trigger: messageTrigger,
    status: messageStatus,
    // For a teacher, masked except the last 3 digits (•••••••123).
    phone: z.string(),
    guardianName: z.string().nullable(),
    students: z.array(z.string()),
    // Set when sent (the guardian's language at that moment).
    locale: z.enum(['ar', 'en']).nullable(),
    attempts: z.int(),
    sendAfter: z.iso.datetime(),
    sentAt: z.iso.datetime().nullable(),
    body: z.string().nullable(),
    lastError: z.string().nullable(),
    skipReason: skipReason.nullable(),
    createdAt: z.iso.datetime(),
  })
  .meta({ id: 'OutboxMessage' });

export const outboxMessageList = z.array(outboxMessage).meta({ id: 'OutboxMessageList' });

export type MessageSettings = z.infer<typeof messageSettings>;
export type ListMessagesQuery = z.infer<typeof listMessagesQuery>;
export type OutboxMessage = z.infer<typeof outboxMessage>;
