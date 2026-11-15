import { Injectable } from '@nestjs/common';
import { sql } from 'drizzle-orm';
import type {
  CashEntry,
  CashSummary,
  CollectionStats,
  MethodTotals,
  OwingStudent,
  StaffCash,
  StatsDay,
  TodayStats,
  TrendStats,
} from '@dafter/contracts';
import type { Tx } from '@dafter/db';
import { TenantRepository } from '../tenant.repository.js';

const CHECKED_IN = sql`('present', 'late', 'makeup')`;
const WEEKS = 8;
const MONTHS = 6;

/** "YYYY-MM" of `back` months before `ym`. */
const monthBack = (ym: string, back: number) => {
  const [y, m] = ym.split('-').map(Number) as [number, number];
  return new Date(Date.UTC(y, m - 1 - back, 1)).toISOString().slice(0, 7);
};

/** Groups of `teacherIds` (undefined = every group), as a SQL condition on alias `g`. */
const visibleGroups = (teacherIds?: string[]) =>
  teacherIds
    ? sql`and g.teacher_membership_id = any(${`{${teacherIds.join(',')}}`}::uuid[])`
    : sql``;

@Injectable()
export class StatsRepository extends TenantRepository {
  /**
   * Every student whose balance over the visible groups' entries is above zero, biggest first.
   * shortcut: no paging (a center has a few hundred students); add a cursor if lists grow.
   */
  async owing(workspaceId: string, teacherIds?: string[]): Promise<OwingStudent[]> {
    if (teacherIds?.length === 0) return [];
    const rows = await this.inTenant(workspaceId, (tx) =>
      tx.execute<{
        id: string;
        name_ar: string;
        name_en: string | null;
        grade_id: string;
        grade_ar: string;
        grade_en: string;
        balance: string;
      }>(sql`
        select st.id, st.name_ar, st.name_en, gl.id as grade_id, gl.name_ar as grade_ar,
          gl.name_en as grade_en, sum(e.amount_piastres) as balance
        from ledger_entries e
        join groups g on g.workspace_id = e.workspace_id and g.id = e.group_id
        join students st on st.workspace_id = e.workspace_id and st.id = e.student_id
        join grade_levels gl on gl.workspace_id = st.workspace_id and gl.id = st.grade_level_id
        where e.workspace_id = ${workspaceId} ${visibleGroups(teacherIds)}
        group by st.id, gl.id
        having sum(e.amount_piastres) > 0
        order by balance desc, st.name_ar`),
    );
    return rows.rows.map((r) => ({
      id: r.id,
      nameAr: r.name_ar,
      nameEn: r.name_en,
      gradeLevel: { id: r.grade_id, nameAr: r.grade_ar, nameEn: r.grade_en },
      balancePiastres: Number(r.balance),
    }));
  }

  /**
   * Payments (stored negative) and reversals of payments (positive, method from the original),
   * from the start of this month in the workspace timezone up to `now`. A reversal counts on the
   * day it was made. Reversals of charges are not money in, so they are left out.
   */
  async collections(
    workspaceId: string,
    now: Date,
    teacherIds?: string[],
  ): Promise<CollectionStats> {
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
        join groups g on g.workspace_id = e.workspace_id and g.id = e.group_id
        cross join ctx
        where e.workspace_id = ${workspaceId} ${visibleGroups(teacherIds)}
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
   * One local day's payments and reversals of payments, each under the recorder of the payment
   * (a reversal by the owner still comes off the assistant who took the money), on the day the
   * entry was made, up to `now`. `onlyUserId` limits it to one recorder. `caller` always gets a
   * section, even when empty. Null when `date` is after today in the workspace timezone.
   */
  async cashSummary(
    workspaceId: string,
    now: Date,
    caller: string,
    date: string | undefined,
    onlyUserId?: string,
  ): Promise<CashSummary | null> {
    const at = now.toISOString();
    return this.inTenant(workspaceId, async (tx) => {
      const head = await tx.execute<{
        day: string;
        today: string;
        tz: string;
        name_ar: string;
        name_en: string | null;
        caller_name: string;
      }>(sql`
        select to_char(coalesce(${date ?? null}::date, l.today), 'YYYY-MM-DD') as day,
          to_char(l.today, 'YYYY-MM-DD') as today, w.timezone as tz, w.name_ar, w.name_en,
          (select u.name from users u where u.id = ${caller}) as caller_name
        from workspaces w
        cross join lateral (select (${at}::timestamptz at time zone w.timezone)::date as today) l
        where w.id = ${workspaceId}`);
      const h = head.rows[0]!;
      if (h.day > h.today) return null;

      const rows = await tx.execute<{
        id: string;
        type: 'payment' | 'reversal';
        receipt_no: number;
        method: CashEntry['method'];
        amount: string;
        created_at: Date;
        user_id: string;
        user_name: string;
        student_name: string;
      }>(sql`
        select e.id, e.type, coalesce(p.receipt_no, e.receipt_no) as receipt_no,
          coalesce(p.method, e.method) as method, -e.amount_piastres as amount, e.created_at,
          u.id as user_id, u.name as user_name, st.name_ar as student_name
        from ledger_entries e
        left join ledger_entries p on p.workspace_id = e.workspace_id and p.id = e.reverses_entry_id
        join students st on st.workspace_id = e.workspace_id and st.id = e.student_id
        join users u on u.id = coalesce(p.created_by, e.created_by)
        where e.workspace_id = ${workspaceId}
          and (e.type = 'payment' or p.type = 'payment')
          and e.created_at <= ${at}::timestamptz
          and (e.created_at at time zone ${h.tz})::date = ${h.day}::date
          ${onlyUserId ? sql`and u.id = ${onlyUserId}` : sql``}
        order by e.created_at, e.id`);

      const staff = new Map<string, StaffCash>();
      const section = (userId: string, name: string) => {
        let s = staff.get(userId);
        if (!s) {
          s = {
            userId,
            name,
            totals: { cash: 0, vodafone_cash: 0, instapay: 0, total: 0 },
            entries: [],
          };
          staff.set(userId, s);
        }
        return s;
      };
      section(caller, h.caller_name);
      for (const r of rows.rows) {
        const s = section(r.user_id, r.user_name);
        const amount = Number(r.amount);
        s.totals[r.method] += amount;
        s.totals.total += amount;
        s.entries.push({
          id: r.id,
          kind: r.type,
          receiptNo: r.receipt_no,
          studentName: r.student_name,
          amountPiastres: amount,
          method: r.method,
          createdAt: new Date(r.created_at).toISOString(),
        });
      }
      const [mine, ...others] = [...staff.values()];
      return {
        date: h.day,
        timezone: h.tz,
        center: { nameAr: h.name_ar, nameEn: h.name_en },
        staff: [mine!, ...others.sort((a, b) => a.name.localeCompare(b.name, 'ar'))],
      };
    });
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

  /**
   * The dashboard over the visible active groups: 8 Saturday-start weeks up to this week in the
   * workspace timezone (attendance records of non-cancelled sessions, exams held in them), and,
   * when `withMoney`, payments minus their reversals per local month for 6 months.
   */
  trends(
    workspaceId: string,
    now: Date,
    teacherIds: string[] | undefined,
    withMoney: boolean,
  ): Promise<TrendStats> {
    const at = now.toISOString();
    const ctx = sql`
      ctx as (
        select l.today, l.tz,
          (l.today - ((extract(dow from l.today)::int + 1) % 7))::date as this_week
        from (select (${at}::timestamptz at time zone w.timezone)::date as today, w.timezone as tz
              from workspaces w where w.id = ${workspaceId}) l
      ),
      weeks as (select (ctx.this_week - 7 * k)::date as wk from ctx, generate_series(0, ${WEEKS - 1}::int) k)`;
    const vis = sql`g.workspace_id = ${workspaceId} and g.status = 'active' ${visibleGroups(teacherIds)}`;

    return this.inTenant(workspaceId, async (tx) => {
      const weeks = await tx.execute<{ wk: string; month: string }>(sql`
        with ${ctx}
        select to_char(wk, 'YYYY-MM-DD') as wk, to_char(ctx.today, 'YYYY-MM') as month
        from weeks, ctx order by wk`);

      const groups = await tx.execute<{
        id: string;
        subject_id: string;
        subject_ar: string;
        subject_en: string;
        grade_id: string;
        grade_ar: string;
        grade_en: string;
        label: string | null;
        teacher: string;
      }>(sql`
        select g.id, sub.id as subject_id, sub.name_ar as subject_ar, sub.name_en as subject_en,
          gl.id as grade_id, gl.name_ar as grade_ar, gl.name_en as grade_en, g.label,
          u.name as teacher
        from groups g
        join subjects sub on sub.workspace_id = g.workspace_id and sub.id = g.subject_id
        join grade_levels gl on gl.workspace_id = g.workspace_id and gl.id = g.grade_level_id
        join memberships m on m.workspace_id = g.workspace_id and m.id = g.teacher_membership_id
        join users u on u.id = m.user_id
        where ${vis}
        order by sub.name_ar, gl.name_ar, g.label nulls first, g.id`);

      const attendance = await tx.execute<{
        group_id: string;
        wk: string;
        present: number;
        total: number;
      }>(sql`
        with ${ctx}
        select g.id as group_id, to_char(wk.wk, 'YYYY-MM-DD') as wk,
          (count(a.id) filter (where a.status in ${CHECKED_IN}))::int as present,
          count(a.id)::int as total
        from groups g cross join weeks wk cross join ctx
        left join sessions se on se.workspace_id = g.workspace_id and se.group_id = g.id
          and se.status <> 'cancelled'
          and (se.starts_at at time zone ctx.tz)::date between wk.wk and wk.wk + 6
        left join attendance_records a on a.workspace_id = se.workspace_id and a.session_id = se.id
        where ${vis}
        group by g.id, wk.wk`);

      const exams = await tx.execute<{
        id: string;
        group_id: string;
        title: string;
        held_on: string;
        pct: number | null;
      }>(sql`
        with ${ctx}
        select ex.id, ex.group_id, ex.title, to_char(ex.held_on, 'YYYY-MM-DD') as held_on,
          round((avg(r.score) * 100 / ex.max_score)::numeric, 1)::float8 as pct
        from exams ex
        cross join ctx
        join groups g on g.workspace_id = ex.workspace_id and g.id = ex.group_id
        left join exam_results r on r.workspace_id = ex.workspace_id and r.exam_id = ex.id
        where ex.workspace_id = ${workspaceId} and ${vis}
          and ex.held_on between ctx.this_week - ${7 * (WEEKS - 1)}::int and ctx.today
        group by ex.id
        order by ex.held_on, ex.created_at`);

      const counts = new Map(attendance.rows.map((r) => [`${r.group_id}:${r.wk}`, r]));
      return {
        weeks: weeks.rows.map((r) => r.wk),
        groups: groups.rows.map((g) => ({
          id: g.id,
          subject: { id: g.subject_id, nameAr: g.subject_ar, nameEn: g.subject_en },
          gradeLevel: { id: g.grade_id, nameAr: g.grade_ar, nameEn: g.grade_en },
          label: g.label,
          teacherName: g.teacher,
          attendance: weeks.rows.map((w) => {
            const c = counts.get(`${g.id}:${w.wk}`)!;
            return { present: c.present, total: c.total };
          }),
          exams: exams.rows
            .filter((e) => e.group_id === g.id)
            .map((e) => ({ id: e.id, title: e.title, heldOn: e.held_on, averagePct: e.pct })),
        })),
        money: withMoney
          ? await this.months(tx, workspaceId, at, weeks.rows[0]!.month, teacherIds)
          : null,
      };
    });
  }

  /** Same rules as `collections`, per local month, oldest first, empty months as zero. */
  private async months(
    tx: Tx,
    workspaceId: string,
    at: string,
    current: string,
    teacherIds?: string[],
  ) {
    const from = monthBack(current, MONTHS - 1);
    const rows = await tx.execute<{
      month: string;
      method: keyof Omit<MethodTotals, 'total'>;
      amount: string;
    }>(sql`
      select to_char(e.created_at at time zone w.timezone, 'YYYY-MM') as month,
        coalesce(p.method, e.method) as method, sum(-e.amount_piastres) as amount
      from ledger_entries e
      left join ledger_entries p on p.workspace_id = e.workspace_id and p.id = e.reverses_entry_id
      join groups g on g.workspace_id = e.workspace_id and g.id = e.group_id
      join workspaces w on w.id = e.workspace_id
      where e.workspace_id = ${workspaceId} ${visibleGroups(teacherIds)}
        and (e.type = 'payment' or p.type = 'payment')
        and e.created_at <= ${at}::timestamptz
        and to_char(e.created_at at time zone w.timezone, 'YYYY-MM') >= ${from}
      group by 1, 2`);
    return Array.from({ length: MONTHS }, (_, i) => {
      const month = monthBack(current, MONTHS - 1 - i);
      const t = { month, cash: 0, vodafone_cash: 0, instapay: 0, total: 0 };
      for (const r of rows.rows.filter((r) => r.month === month)) {
        t[r.method] = Number(r.amount);
        t.total += Number(r.amount);
      }
      return t;
    });
  }
}
