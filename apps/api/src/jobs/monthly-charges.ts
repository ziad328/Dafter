import type { Db } from '@dafter/db';
import type { Clock } from '../clock.js';
import { enqueueFeeOverdue } from '../messages/outbox.js';
import { chargeMonth } from '../money/charges.js';
import { forEachWorkspace } from './for-each-workspace.js';

export const MONTHLY_CHARGES = 'monthly-charges';

/** Bills the current month in every workspace; reruns are no-ops (one charge per enrollment and month). */
export const chargeAllWorkspaces = (db: Db, clock: Clock) =>
  forEachWorkspace(db, MONTHLY_CHARGES, (tx, id) => chargeMonth(tx, id, clock.now()));

/** After the charges: the monthly fee reminders (from the 7th, once per guardian and month). */
export const remindAllWorkspaces = (db: Db, clock: Clock) =>
  forEachWorkspace(db, 'fee-reminders', (tx, id) => enqueueFeeOverdue(tx, id, clock.now()));
