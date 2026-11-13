import { sql } from 'drizzle-orm';
import type { Tx } from '@dafter/db';

/**
 * Bills this month (in the workspace timezone) for every active enrollment of an active (not
 * archived) student in an active group with a monthly fee: the fee minus the enrollment's
 * discount, rounded to whole piastres. The unique (student, group, month) charge index makes
 * reruns no-ops, so the daily job and the
 * enroll call can both run it. Must run inside the workspace's withTenant transaction.
 */
export async function chargeMonth(tx: Tx, workspaceId: string, now: Date, enrollmentId?: string) {
  const { rowCount } = await tx.execute(sql`
    insert into ledger_entries
      (workspace_id, student_id, group_id, type, amount_piastres, enrollment_id, period)
    select e.workspace_id, e.student_id, e.group_id, 'charge', a.amount, e.id,
           to_char(${now.toISOString()}::timestamptz at time zone w.timezone, 'YYYY-MM')
    from enrollments e
    join groups g on g.workspace_id = e.workspace_id and g.id = e.group_id
    join students st on st.workspace_id = e.workspace_id and st.id = e.student_id
    join workspaces w on w.id = e.workspace_id
    cross join lateral (
      select round(g.monthly_fee_piastres * (100 - e.discount_pct) / 100.0)::bigint as amount
    ) a
    where e.workspace_id = ${workspaceId}
      and e.status = 'active'
      and g.status = 'active'
      and st.status = 'active'
      and g.monthly_fee_piastres is not null
      and a.amount > 0
      ${enrollmentId ? sql`and e.id = ${enrollmentId}` : sql``}
    on conflict do nothing`);
  return rowCount ?? 0;
}
