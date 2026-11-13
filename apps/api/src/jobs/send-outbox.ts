import { and, eq, lte, sql } from 'drizzle-orm';
import { type Db, guardians, outboxMessages, type Tx, withTenant, workspaces } from '@dafter/db';
import type { Clock } from '../clock.js';
import type { MessageProvider } from '../messages/provider.js';
import { type MessagePayload, render } from '../messages/templates.js';

export const SEND_OUTBOX = 'send-outbox';
export const MAX_ATTEMPTS = 5;
const BATCH = 50;

/**
 * Delivers due outbox rows in every workspace (or only `workspaceId`). Rows are locked with SKIP
 * LOCKED, so two senders never send the same row. A failure waits 2^attempts minutes; after 5
 * attempts it is failed.
 */
export async function sendDueMessages(
  db: Db,
  clock: Clock,
  provider: MessageProvider,
  workspaceId?: string,
) {
  // shortcut: one pass over every workspace, like the other jobs; fan out when there are thousands.
  const rows = workspaceId
    ? [{ id: workspaceId }]
    : await db.select({ id: workspaces.id }).from(workspaces);
  let sent = 0;
  for (const { id } of rows) sent += await withTenant(db, id, (tx) => sendWorkspace(tx, id));
  return sent;

  async function sendWorkspace(tx: Tx, ws: string) {
    const now = clock.now();
    const due = await tx
      .select({
        id: outboxMessages.id,
        trigger: outboxMessages.trigger,
        payload: outboxMessages.payload,
        attempts: outboxMessages.attempts,
        phone: guardians.phone,
        locale: guardians.preferredLocale,
      })
      .from(outboxMessages)
      .innerJoin(guardians, eq(guardians.id, outboxMessages.guardianId))
      .where(
        and(
          eq(outboxMessages.workspaceId, ws),
          eq(outboxMessages.status, 'queued'),
          lte(outboxMessages.sendAfter, now),
        ),
      )
      .orderBy(outboxMessages.sendAfter)
      .limit(BATCH)
      .for('update', { of: outboxMessages, skipLocked: true });
    let n = 0;
    for (const m of due) {
      const body = render(m.trigger, m.payload as MessagePayload, m.locale);
      try {
        const providerMessageId = await provider.send(m.phone, body);
        await tx
          .update(outboxMessages)
          .set({ status: 'sent', body, locale: m.locale, providerMessageId, sentAt: now })
          .where(eq(outboxMessages.id, m.id));
        n++;
      } catch (err) {
        const attempts = m.attempts + 1;
        await tx
          .update(outboxMessages)
          .set({
            attempts,
            status: attempts >= MAX_ATTEMPTS ? 'failed' : 'queued',
            sendAfter: sql`${now.toISOString()}::timestamptz + ${2 ** attempts} * interval '1 minute'`,
            lastError: String(err).slice(0, 500),
          })
          .where(eq(outboxMessages.id, m.id));
      }
    }
    return n;
  }
}
