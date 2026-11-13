import * as z from 'zod';

/** A parent message the provider has sent (the fake-phone page shows these per guardian). */
export const sentMessage = z
  .object({
    id: z.uuid(),
    phone: z.string(),
    guardianName: z.string().nullable(),
    locale: z.enum(['ar', 'en']),
    body: z.string(),
    sentAt: z.iso.datetime(),
  })
  .meta({ id: 'SentMessage' });

export const sentMessageList = z.array(sentMessage).meta({ id: 'SentMessageList' });

export type SentMessage = z.infer<typeof sentMessage>;

export const messageTrigger = z.enum(['absence', 'session_cancelled', 'session_moved']);
export const messageStatus = z.enum(['queued', 'sent', 'failed']);

/** Per-workspace switches: which events message parents. Both default to on. */
export const messageSettings = z
  .object({ absence: z.boolean(), sessionChange: z.boolean() })
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
    createdAt: z.iso.datetime(),
  })
  .meta({ id: 'OutboxMessage' });

export const outboxMessageList = z.array(outboxMessage).meta({ id: 'OutboxMessageList' });

export type MessageSettings = z.infer<typeof messageSettings>;
export type ListMessagesQuery = z.infer<typeof listMessagesQuery>;
export type OutboxMessage = z.infer<typeof outboxMessage>;
