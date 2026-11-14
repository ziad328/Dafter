import { Injectable } from '@nestjs/common';
import { sql } from 'drizzle-orm';
import type { CollectionStats, MethodTotals, StatsDay, TodayStats } from '@dafter/contracts';
import { TenantRepository } from '../tenant.repository.js';

const CHECKED_IN = sql`('present', 'late', 'makeup')`;

@Injectable()
export class StatsRepository extends TenantRepository {
  /**
   * Payments (stored negative) and reversals of payments (positive, method from the original),
   * from the start of this month in the workspace timezone up to `now`. A reversal counts on the
   * day it was made. Reversals of charges are not money in, so they are left out.
   */
  async collections(workspaceId: string, now: Date): Promise<CollectionStats> {
    const at = now.toISOString();
    const rows = await this.inTenant(workspaceId, (tx) =>
      tx.execute<{ method: keyof Omit<MethodTotals, 'total'>; today: string; month: string }>(sql`
        with ctx as (
          select (${at}::timestamptz at time zone w.timezone) as local, w.timezone as tz
          from workspaces w where w.id = ${workspaceId}
        )
        select coalesce(p.method, e.method) as method,
          coalesce(sum(-e.amount_piastres) filter (
            where (e.created_at at time zone ctx.tz)::date = ctx.local::date), 0) as today,
          sum(-e.amount_piastres) as month
        from ledger_entries e
        left join ledger_entries p on p.workspace_id = e.workspace_id and p.id = e.reverses_entry_id
        cross join ctx
        where e.workspace_id = ${workspaceId}
          and (e.type = 'payment' or p.type = 'payment')
          and e.created_at <= ${at}::timestamptz
          and (e.created_at at time zone ctx.tz) >= date_trunc('month', ctx.local)
        group by 1`),
    );
    const totals = (key: 'today' | 'month') => {
      const t: MethodTotals = { cash: 0, vodafone_cash: 0, instapay: 0, total: 0 };
      for (const r of rows.rows) {
        t[r.method] = Number(r[key]);
        t.total += Number(r[key]);
      }
      return t;
    };
    return { today: totals('today'), month: totals('month') };
  }

  /**
   * The Today numbers for the groups of `teacherIds` (undefined = every group), with "today" and
   * the week in the workspace timezone. One transaction, three reads.
   */
  today(workspaceId: string, now: Date, teacherIds?: string[]): Promise<TodayStats> {
    const at = now.toISOString();
    const visible = teacherIds
      ? sql`and g.teacher_membership_id = any(${`{${teacherIds.join(',')}}`}::uuid[])`
      : sql``;
    // Groups the caller can see, and the workspace's local "today".
    const base = sql`
      ctx as (
        select (${at}::timestamptz at time zone w.timezone)::date as today, w.timezone as tz
        from workspaces w where w.id = ${workspaceId}
      ),
      vis as (select g.id from groups g where g.workspace_id = ${workspaceId} ${visible})`;

    return this.inTenant(workspaceId, async (tx) => {
      const counts = await tx.execute<{
        sessions_today: number;
        expected_today: number;
        checked_in_today: number;
        active_students: number;
      }>(sql`
        with ${base},
        today as (
          select se.id, se.group_id from sessions se, ctx
          where se.workspace_id = ${workspaceId} and se.group_id in (select id from vis)
            and se.status <> 'cancelled'
            and (se.starts_at at time zone ctx.tz)::date = ctx.today
        )
        select
          (select count(*) from today)::int as sessions_today,
          (select count(*) from today t
             join enrollments e on e.workspace_id = ${workspaceId} and e.group_id = t.group_id
               and e.status = 'active'
             join students st on st.workspace_id = e.workspace_id and st.id = e.student_id
               and st.status = 'active')::int as expected_today,
          (select count(*) from attendance_records a join today t on t.id = a.session_id
             where a.workspace_id = ${workspaceId} and a.status in ${CHECKED_IN})::int
            as checked_in_today,
          (select count(*) from students st where st.workspace_id = ${workspaceId}
             and st.status = 'active'
             ${
               teacherIds
                 ? sql`and exists (select 1 from enrollments e where e.workspace_id = st.workspace_id
                     and e.student_id = st.id and e.status = 'active'
                     and e.group_id in (select id from vis))`
                 : sql``
             })::int as active_students`);

      const week = await tx.execute<StatsDay>(sql`
        with ${base}
        select to_char(d, 'YYYY-MM-DD') as date,
          (count(a.id) filter (where a.status in ${CHECKED_IN}))::int as present,
          count(a.id)::int as total
        from ctx, generate_series(ctx.today - 6, ctx.today, interval '1 day') d
        left join sessions se on se.workspace_id = ${workspaceId}
          and se.group_id in (select id from vis)
          and (se.starts_at at time zone (select tz from ctx))::date = d::date
        left join attendance_records a on a.workspace_id = se.workspace_id and a.session_id = se.id
        group by d order by d`);

      const c = counts.rows[0]!;
      return {
        sessionsToday: c.sessions_today,
        expectedToday: c.expected_today,
        checkedInToday: c.checked_in_today,
        activeStudents: c.active_students,
        week: week.rows,
      };
    });
  }
}
