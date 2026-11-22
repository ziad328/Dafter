import { and, eq, inArray, lte, sql } from 'drizzle-orm';
import type { CustomTemplates, MessageSettings } from '@dafter/contracts';
import {
  attendanceRecords,
  type Db,
  guardians,
  ledgerEntries,
  outboxMessages,
  students,
  type Tx,
  withTenant,
  workspaces,
} from '@dafter/db';
import type { Clock } from '../clock.js';
import { TOGGLE } from '../messages/outbox.js';
import type { MessageProvider } from '../messages/provider.js';
import {
  type FeePayload,
  type MessagePayload,
  render,
  type Trigger,
} from '../messages/templates.js';

export const SEND_OUTBOX = 'send-outbox';
export const MAX_ATTEMPTS = 5;
const BATCH = 50;

/**
 * Delivers due outbox rows in every workspace (or only `workspaceId`). Rows are locked with SKIP
 * LOCKED, so two senders never send the same row. A failure waits 2^attempts minutes; after 5
 * attempts it is failed. Each row is re-checked first (`recheck`), under the same lock.
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
    if (!due.length) return 0;
    // The center's own wording, read once per pass; rows queued before an edit use the new text.
    const [settings] = await tx
      .select({
        templates: sql<CustomTemplates | null>`${workspaces.settings}->'templates'`,
        messages: sql<Partial<MessageSettings> | null>`${workspaces.settings}->'messages'`,
      })
      .from(workspaces)
      .where(eq(workspaces.id, ws));
    const custom = settings?.templates ?? undefined;
    const facts = await recheckFacts(tx, ws, due);
    let n = 0;
    for (const m of due) {
      const checked = recheck(m.trigger as Trigger, m.payload, settings?.messages, facts);
      if ('skip' in checked) {
        await tx
          .update(outboxMessages)
          .set({ status: 'skipped', skipReason: checked.skip })
          .where(eq(outboxMessages.id, m.id));
        continue;
      }
      const { payload } = checked;
      const body = render(m.trigger, payload as Parameters<typeof render>[1], m.locale, custom);
      try {
        const providerMessageId = await provider.send(m.phone, body);
        await tx
          .update(outboxMessages)
          .set({ status: 'sent', body, payload, locale: m.locale, providerMessageId, sentAt: now })
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

type Checked = { payload: unknown } | { skip: 'paid' | 'trigger_off' | 'not_absent' };

/** What the re-check needs for a whole batch: at most two queries, whatever its size. */
type Facts = { balances: Map<string, number>; absent: Map<string, Set<string>> };

const ids = (p: { students: { id?: string }[] }) => p.students.flatMap((s) => (s.id ? [s.id] : []));

/**
 * The balances of every active child named in the batch's fee reminders, and the absent students
 * of every session in its absence messages. Read under the same lock as the rows.
 */
async function recheckFacts(
  tx: Tx,
  ws: string,
  rows: { trigger: string; payload: unknown }[],
): Promise<Facts> {
  const feeIds = [
    ...new Set(
      rows.flatMap((r) => (r.trigger === 'fee_overdue' ? ids(r.payload as FeePayload) : [])),
    ),
  ];
  const sessionIds = [
    ...new Set(
      rows.flatMap((r) => {
        const p = r.payload as MessagePayload & { sessionId: string };
        return r.trigger === 'absence' && ids(p).length ? [p.sessionId] : [];
      }),
    ),
  ];
  const balances = new Map<string, number>();
  if (feeIds.length) {
    const found = await tx
      .select({
        id: ledgerEntries.studentId,
        balance: sql<number>`sum(${ledgerEntries.amountPiastres})`.mapWith(Number),
      })
      .from(ledgerEntries)
      .innerJoin(
        students,
        and(
          eq(students.workspaceId, ledgerEntries.workspaceId),
          eq(students.id, ledgerEntries.studentId),
        ),
      )
      .where(
        and(
          eq(ledgerEntries.workspaceId, ws),
          inArray(ledgerEntries.studentId, feeIds),
          eq(students.status, 'active'),
        ),
      )
      .groupBy(ledgerEntries.studentId);
    for (const r of found) balances.set(r.id, r.balance);
  }
  const absent = new Map<string, Set<string>>(sessionIds.map((id) => [id, new Set()]));
  if (sessionIds.length) {
    const found = await tx
      .select({ sessionId: attendanceRecords.sessionId, id: attendanceRecords.studentId })
      .from(attendanceRecords)
      .where(
        and(
          eq(attendanceRecords.workspaceId, ws),
          inArray(attendanceRecords.sessionId, sessionIds),
          eq(attendanceRecords.status, 'absent'),
        ),
      );
    for (const r of found) absent.get(r.sessionId)!.add(r.id);
  }
  return { balances, absent };
}

/**
 * Is the message still true? Run just before sending, on the locked row, with the batch's facts.
 * A trigger switched off since it was queued is skipped. A fee reminder keeps only the active
 * children who still owe, with today's balance; an absence keeps only the children still marked
 * absent. With none left the row is skipped, never deleted, so its dedupe key stays taken and a
 * rerun queues nothing. Rows queued before students carried an `id` are sent as they are.
 */
function recheck(
  trigger: Trigger,
  payload: unknown,
  messages: Partial<MessageSettings> | null | undefined,
  facts: Facts,
): Checked {
  const key = TOGGLE[trigger];
  if (!(messages?.[key] ?? key !== 'feeOverdue')) return { skip: 'trigger_off' };

  if (trigger === 'fee_overdue') {
    const p = payload as FeePayload;
    if (!ids(p).length) return { payload };
    const owing = p.students
      .map((s) => (s.id ? { ...s, balancePiastres: facts.balances.get(s.id) ?? 0 } : s))
      .filter((s) => s.balancePiastres > 0);
    return owing.length ? { payload: { ...p, students: owing } } : { skip: 'paid' };
  }

  if (trigger === 'absence') {
    const p = payload as MessagePayload & { sessionId: string };
    if (!ids(p).length) return { payload };
    const absent = facts.absent.get(p.sessionId)!;
    const still = p.students.filter((s) => !s.id || absent.has(s.id));
    return still.length ? { payload: { ...p, students: still } } : { skip: 'not_absent' };
  }

  return { payload };
}
