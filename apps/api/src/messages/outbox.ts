import { type SQL, sql } from 'drizzle-orm';
import type { Tx } from '@dafter/db';
import type { Trigger } from './templates.js';

/** Per-workspace switches in `workspaces.settings.messages`; missing means on (fee reminders: off). */
export const TOGGLE: Record<Trigger, 'absence' | 'sessionChange' | 'examResult' | 'feeOverdue'> = {
  absence: 'absence',
  session_cancelled: 'sessionChange',
  session_moved: 'sessionChange',
  exam_result: 'examResult',
  fee_overdue: 'feeOverdue',
};

/**
 * `settings.messages.primaryOnly`: only each student's primary guardian (alias `sg`) is messaged;
 * a student with no primary keeps all their guardians, so no family goes silent. Off by default.
 */
const guardianFilter = (workspaceId: string) => sql`
  and (sg.is_primary
    or not coalesce((select (pw.settings->'messages'->>'primaryOnly')::boolean
      from workspaces pw where pw.id = ${workspaceId}), false)
    or not exists (select 1 from student_guardians p
      where p.workspace_id = sg.workspace_id and p.student_id = sg.student_id and p.is_primary))`;

/**
 * Inside the business transaction: one message per guardian of the affected students, unless the
 * workspace switched the trigger off. Grouping by guardian merges siblings; the unique dedupe_key
 * makes a repeat a no-op. Quiet hours (workspace timezone) push send_after to 08:00.
 */
async function enqueue(
  tx: Tx,
  workspaceId: string,
  sessionId: string,
  now: Date,
  trigger: Trigger,
  students: SQL,
  dedupeSuffix: SQL = sql``,
  extra: SQL = sql`'{}'::jsonb`,
) {
  await tx.execute(sql`
    insert into outbox_messages (workspace_id, guardian_id, trigger, payload, dedupe_key, send_after)
    select ${workspaceId}, sg.guardian_id, ${trigger},
      ${extra} || jsonb_build_object(
        'sessionId', s.id,
        'startsAt', s.starts_at,
        'timezone', w.timezone,
        'centerAr', w.name_ar,
        'centerEn', w.name_en,
        'subjectAr', sub.name_ar,
        'subjectEn', sub.name_en,
        'students', jsonb_agg(jsonb_build_object('id', st.id, 'nameAr', st.name_ar,
                              'nameEn', st.name_en) order by st.name_ar)),
      ${trigger} || ':' || s.id || ':' || sg.guardian_id ${dedupeSuffix},
      quiet_hours_send_after(${now.toISOString()}::timestamptz, w.timezone)
    from sessions s
    join groups g on g.workspace_id = s.workspace_id and g.id = s.group_id
    join subjects sub on sub.workspace_id = g.workspace_id and sub.id = g.subject_id
    join workspaces w on w.id = s.workspace_id
    join students st on st.workspace_id = s.workspace_id and st.id in (${students})
    join student_guardians sg on sg.workspace_id = st.workspace_id and sg.student_id = st.id
    where s.workspace_id = ${workspaceId} and s.id = ${sessionId}
      and coalesce((w.settings->'messages'->>${TOGGLE[trigger]})::boolean, true)
      ${guardianFilter(workspaceId)}
    group by sg.guardian_id, s.id, s.starts_at, w.timezone, w.name_ar, w.name_en, sub.name_ar, sub.name_en
    on conflict (workspace_id, dedupe_key) do nothing`);
}

/**
 * Session close: the guardians of every absent student. With `studentId` (a manual "absent" after
 * the close), only that student: same dedupe key, so a guardian already told about this session
 * gets nothing new, and marking absent twice queues once.
 */
export const enqueueAbsences = (
  tx: Tx,
  workspaceId: string,
  sessionId: string,
  now: Date,
  studentId?: string,
) =>
  enqueue(
    tx,
    workspaceId,
    sessionId,
    now,
    'absence',
    sql`select student_id from attendance_records
        where workspace_id = ${workspaceId} and session_id = ${sessionId} and status = 'absent'
          ${studentId ? sql`and student_id = ${studentId}` : sql``}`,
  );

/**
 * Cancel or move: the guardians of the group's active students. A move is keyed by the new start,
 * so a second move to another time sends again, and repeating the same move does not.
 */
export const enqueueSessionChange = (
  tx: Tx,
  workspaceId: string,
  sessionId: string,
  now: Date,
  trigger: 'session_cancelled' | 'session_moved',
  // A move: the start before it, so the text can say «حصة السبت 4:00 م أصبحت الأحد 5:00 م».
  fromStartsAt?: Date,
) =>
  enqueue(
    tx,
    workspaceId,
    sessionId,
    now,
    trigger,
    sql`select e.student_id from enrollments e
        join sessions s2 on s2.workspace_id = e.workspace_id and s2.group_id = e.group_id
        join students st2 on st2.workspace_id = e.workspace_id and st2.id = e.student_id
        where e.workspace_id = ${workspaceId} and s2.id = ${sessionId}
          and e.status = 'active' and st2.status = 'active'`,
    trigger === 'session_moved' ? sql`|| ':' || extract(epoch from s.starts_at)::bigint` : sql``,
    fromStartsAt
      ? sql`jsonb_build_object('fromStartsAt', ${fromStartsAt.toISOString()}::timestamptz)`
      : undefined,
  );

/**
 * Exam "send to parents": one message per guardian of the students with a result, siblings
 * merged. Keyed by exam, guardian and that guardian's results, so a second press queues nothing
 * and a press after a correction texts only the guardians whose children's results changed.
 * Returns how many rows were queued now.
 */
export async function enqueueExamResults(tx: Tx, workspaceId: string, examId: string, now: Date) {
  const res = await tx.execute(sql`
    insert into outbox_messages (workspace_id, guardian_id, trigger, payload, dedupe_key, send_after)
    select ${workspaceId}, sg.guardian_id, 'exam_result',
      jsonb_build_object(
        'examId', ex.id,
        'title', ex.title,
        'heldOn', to_char(ex.held_on, 'YYYY-MM-DD'),
        'maxScore', ex.max_score,
        'centerAr', w.name_ar,
        'centerEn', w.name_en,
        'subjectAr', sub.name_ar,
        'subjectEn', sub.name_en,
        -- This guardian already got this exam's results: the new message is a correction.
        'corrected', exists (select 1 from outbox_messages o
          where o.workspace_id = ex.workspace_id and o.guardian_id = sg.guardian_id
            and o.trigger = 'exam_result' and o.payload->>'examId' = ex.id::text),
        'students', jsonb_agg(jsonb_build_object('nameAr', st.name_ar, 'nameEn', st.name_en,
                              'score', r.score, 'absent', r.absent) order by st.name_ar)),
      -- The guardian's results are in the key: a repeat is a no-op, a corrected score sends again.
      'exam_result:' || ex.id || ':' || sg.guardian_id || ':' || md5((jsonb_agg(
        jsonb_build_object('id', st.id, 'score', r.score, 'absent', r.absent) order by st.id))::text),
      quiet_hours_send_after(${now.toISOString()}::timestamptz, w.timezone)
    from exams ex
    join groups g on g.workspace_id = ex.workspace_id and g.id = ex.group_id
    join subjects sub on sub.workspace_id = g.workspace_id and sub.id = g.subject_id
    join workspaces w on w.id = ex.workspace_id
    join exam_results r on r.workspace_id = ex.workspace_id and r.exam_id = ex.id
    join students st on st.workspace_id = r.workspace_id and st.id = r.student_id
    join student_guardians sg on sg.workspace_id = st.workspace_id and sg.student_id = st.id
    where ex.workspace_id = ${workspaceId} and ex.id = ${examId}
      and coalesce((w.settings->'messages'->>${TOGGLE.exam_result})::boolean, true)
      ${guardianFilter(workspaceId)}
    group by sg.guardian_id, ex.id, w.id, sub.id
    on conflict (workspace_id, dedupe_key) do nothing`);
  return res.rowCount ?? 0;
}

/** The day of the month (workspace timezone) from which unpaid balances get a reminder. */
export const OVERDUE_FROM_DAY = 7;

/**
 * Daily, from the 7th of the month: one reminder per guardian of the active students whose
 * balance is above zero, siblings merged with each child's balance. Keyed by month and guardian,
 * so a guardian gets at most one a month however often the job runs. Off unless the workspace
 * switched it on. Returns how many rows were queued now.
 */
export async function enqueueFeeOverdue(tx: Tx, workspaceId: string, now: Date) {
  const res = await tx.execute(sql`
    with ctx as (
      select w.id, w.name_ar, w.name_en, w.timezone,
        (${now.toISOString()}::timestamptz at time zone w.timezone) as local
      from workspaces w
      where w.id = ${workspaceId}
        and coalesce((w.settings->'messages'->>${TOGGLE.fee_overdue})::boolean, false)
    ),
    owing as (
      select e.student_id, sum(e.amount_piastres) as balance
      from ledger_entries e
      where e.workspace_id = ${workspaceId}
      group by e.student_id
      having sum(e.amount_piastres) > 0
    )
    insert into outbox_messages (workspace_id, guardian_id, trigger, payload, dedupe_key, send_after)
    select ${workspaceId}, sg.guardian_id, 'fee_overdue',
      jsonb_build_object(
        'period', to_char(ctx.local, 'YYYY-MM'),
        'centerAr', ctx.name_ar,
        'centerEn', ctx.name_en,
        'students', jsonb_agg(jsonb_build_object('id', st.id, 'nameAr', st.name_ar,
                              'nameEn', st.name_en, 'balancePiastres', o.balance)
                              order by st.name_ar)),
      'fee_overdue:' || to_char(ctx.local, 'YYYY-MM') || ':' || sg.guardian_id,
      quiet_hours_send_after(${now.toISOString()}::timestamptz, ctx.timezone)
    from ctx
    join owing o on true
    join students st on st.workspace_id = ${workspaceId} and st.id = o.student_id
      and st.status = 'active'
    join student_guardians sg on sg.workspace_id = st.workspace_id and sg.student_id = st.id
    where extract(day from ctx.local) >= ${OVERDUE_FROM_DAY}
      ${guardianFilter(workspaceId)}
    group by sg.guardian_id, ctx.local, ctx.name_ar, ctx.name_en, ctx.timezone
    on conflict (workspace_id, dedupe_key) do nothing`);
  return res.rowCount ?? 0;
}
