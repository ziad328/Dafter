import { type SQL, sql } from 'drizzle-orm';
import type { Tx } from '@dafter/db';
import type { Trigger } from './templates.js';

/** Per-workspace switches in `workspaces.settings.messages`; missing means on. */
export const TOGGLE: Record<Trigger, 'absence' | 'sessionChange'> = {
  absence: 'absence',
  session_cancelled: 'sessionChange',
  session_moved: 'sessionChange',
};

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
) {
  await tx.execute(sql`
    insert into outbox_messages (workspace_id, guardian_id, trigger, payload, dedupe_key, send_after)
    select ${workspaceId}, sg.guardian_id, ${trigger},
      jsonb_build_object(
        'sessionId', s.id,
        'startsAt', s.starts_at,
        'timezone', w.timezone,
        'centerAr', w.name_ar,
        'centerEn', w.name_en,
        'subjectAr', sub.name_ar,
        'subjectEn', sub.name_en,
        'students', jsonb_agg(jsonb_build_object('nameAr', st.name_ar, 'nameEn', st.name_en)
                              order by st.name_ar)),
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
    group by sg.guardian_id, s.id, s.starts_at, w.timezone, w.name_ar, w.name_en, sub.name_ar, sub.name_en
    on conflict (workspace_id, dedupe_key) do nothing`);
}

/** Session close: the guardians of every absent student. */
export const enqueueAbsences = (tx: Tx, workspaceId: string, sessionId: string, now: Date) =>
  enqueue(
    tx,
    workspaceId,
    sessionId,
    now,
    'absence',
    sql`select student_id from attendance_records
        where workspace_id = ${workspaceId} and session_id = ${sessionId} and status = 'absent'`,
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
  );
