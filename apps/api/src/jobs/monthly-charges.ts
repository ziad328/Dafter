import { type Db, withTenant, workspaces } from '@dafter/db';
import type { Clock } from '../clock.js';
import { enqueueFeeOverdue } from '../messages/outbox.js';
import { chargeMonth } from '../money/charges.js';

export const MONTHLY_CHARGES = 'monthly-charges';

/** Bills the current month in every workspace; reruns are no-ops (one charge per enrollment and month). */
export async function chargeAllWorkspaces(db: Db, clock: Clock) {
  // shortcut: one pass over every workspace, like session generation; fan out when there are thousands.
  const rows = await db.select({ id: workspaces.id }).from(workspaces);
  let created = 0;
  for (const { id } of rows)
    created += await withTenant(db, id, (tx) => chargeMonth(tx, id, clock.now()));
  return created;
}

/** After the charges: the monthly fee reminders (from the 7th, once per guardian and month). */
export async function remindAllWorkspaces(db: Db, clock: Clock) {
  const rows = await db.select({ id: workspaces.id }).from(workspaces);
  let queued = 0;
  for (const { id } of rows)
    queued += await withTenant(db, id, (tx) => enqueueFeeOverdue(tx, id, clock.now()));
  return queued;
}
