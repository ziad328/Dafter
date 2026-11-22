import { Logger } from '@nestjs/common';
import { sql } from 'drizzle-orm';
import { type Db, ledgerChecks, type Tx, withTenant, workspaces } from '@dafter/db';
import type { Clock } from '../clock.js';

/**
 * Entries made in the last few minutes are left to the next night: a payment's created_at is its
 * transaction's start, so one still open at the cutoff would commit "in the past" and look like
 * a changed history the night after.
 */
const SETTLE_MS = 5 * 60 * 1000;

export type LedgerProblem =
  // An entry made up to the last check's cutoff was changed or removed since.
  | { kind: 'history_changed'; cutoff: string; expected: Totals; found: Totals }
  // A reversal that isn't minus its original, for the same student and group, or reverses a reversal.
  | { kind: 'reversal_mismatch'; entryId: string }
  // The receipt counter is behind the highest receipt number: the next payment would collide.
  | { kind: 'receipt_counter_behind'; last: number; highest: number };

type Totals = { count: number; sum: number };

const totalsUpTo = async (tx: Tx, workspaceId: string, cutoff: string): Promise<Totals> => {
  const { rows } = await tx.execute<{ count: string; sum: string }>(sql`
    select count(*) as count, coalesce(sum(amount_piastres), 0) as sum
    from ledger_entries
    where workspace_id = ${workspaceId} and created_at <= ${cutoff}::timestamptz`);
  return { count: Number(rows[0]!.count), sum: Number(rows[0]!.sum) };
};

/**
 * One workspace: compares the last check's totals with a recount, checks the reversal and receipt
 * rules, and records tonight's totals with what it found. Inside the workspace's withTenant.
 */
export async function checkLedger(
  tx: Tx,
  workspaceId: string,
  now: Date,
): Promise<LedgerProblem[]> {
  const problems: LedgerProblem[] = [];
  const { rows: last } = await tx.execute<{ cutoff: Date; entry_count: number; sum: string }>(sql`
    select cutoff, entry_count, sum_piastres as sum from ledger_checks
    where workspace_id = ${workspaceId} order by cutoff desc limit 1`);
  if (last[0]) {
    const cutoff = new Date(last[0].cutoff).toISOString();
    const expected = { count: last[0].entry_count, sum: Number(last[0].sum) };
    const found = await totalsUpTo(tx, workspaceId, cutoff);
    if (found.count !== expected.count || found.sum !== expected.sum)
      problems.push({ kind: 'history_changed', cutoff, expected, found });
  }

  const { rows: mismatched } = await tx.execute<{ id: string }>(sql`
    select r.id from ledger_entries r
    join ledger_entries o on o.workspace_id = r.workspace_id and o.id = r.reverses_entry_id
    where r.workspace_id = ${workspaceId} and r.type = 'reversal'
      and (r.amount_piastres <> -o.amount_piastres or r.student_id <> o.student_id
        or r.group_id <> o.group_id or o.type = 'reversal')
    order by r.created_at, r.id`);
  for (const r of mismatched) problems.push({ kind: 'reversal_mismatch', entryId: r.id });

  const { rows: receipts } = await tx.execute<{ last: number | null; highest: number | null }>(sql`
    select (select last from receipt_counters where workspace_id = ${workspaceId}) as last,
      (select max(receipt_no) from ledger_entries where workspace_id = ${workspaceId}) as highest`);
  const { last: counter, highest } = receipts[0]!;
  if (highest !== null && (counter ?? 0) < highest)
    problems.push({ kind: 'receipt_counter_behind', last: counter ?? 0, highest });

  const cutoff = new Date(now.getTime() - SETTLE_MS).toISOString();
  const totals = await totalsUpTo(tx, workspaceId, cutoff);
  await tx.insert(ledgerChecks).values({
    workspaceId,
    cutoff: new Date(cutoff),
    entryCount: totals.count,
    sumPiastres: totals.sum,
    problems,
  });
  return problems;
}

/** Nightly, after the charges: every workspace's ledger. Logs each problem; returns how many. */
export async function checkAllLedgers(db: Db, clock: Clock, log = new Logger('LedgerCheck')) {
  // shortcut: one pass over every workspace, like the other daily jobs.
  const rows = await db.select({ id: workspaces.id }).from(workspaces);
  let found = 0;
  for (const { id } of rows) {
    const problems = await withTenant(db, id, (tx) => checkLedger(tx, id, clock.now()));
    for (const p of problems) log.warn(`Ledger drift in workspace ${id}: ${JSON.stringify(p)}`);
    found += problems.length;
  }
  return found;
}
