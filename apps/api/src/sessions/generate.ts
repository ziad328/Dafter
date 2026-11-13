import { sql } from 'drizzle-orm';
import type { Tx } from '@dafter/db';

export const HORIZON_DAYS = 28;

/**
 * Creates the sessions of the next 4 weeks for the workspace's active groups (one group when
 * `groupId` is given). Local date + slot time is turned into UTC by PostgreSQL with the
 * workspace timezone, so DST is handled by the tz database. Safe to re-run: the unique
 * (group, slot_starts_at) key skips occurrences that already exist, moved or cancelled ones too.
 */
export async function generateSessions(tx: Tx, workspaceId: string, now: Date, groupId?: string) {
  const at = now.toISOString();
  const { rowCount } = await tx.execute(sql`
    insert into sessions (workspace_id, group_id, slot_starts_at, starts_at, ends_at)
    select g.workspace_id, g.id, x.starts_at, x.starts_at, x.ends_at
    from groups g
    join workspaces w on w.id = g.workspace_id
    join group_slots s on s.workspace_id = g.workspace_id and s.group_id = g.id
    cross join lateral (select (${at}::timestamptz at time zone w.timezone)::date as today) t
    cross join lateral generate_series(0, ${HORIZON_DAYS - 1}) n
    cross join lateral (select t.today + n as day) d
    cross join lateral (
      select (d.day + s.start_time) at time zone w.timezone as starts_at,
             (d.day + s.end_time) at time zone w.timezone as ends_at
    ) x
    where g.workspace_id = ${workspaceId}
      and g.status = 'active'
      and extract(dow from d.day) = s.weekday
      and x.starts_at > ${at}::timestamptz
      ${groupId ? sql`and g.id = ${groupId}` : sql``}
    on conflict (workspace_id, group_id, slot_starts_at) do nothing`);
  return rowCount ?? 0;
}

/**
 * Before a group's slots are replaced or it is archived: drops its future sessions that are
 * still as generated. Moved and cancelled ones are manual decisions and stay; past ones too.
 */
export function dropGeneratedSessions(tx: Tx, workspaceId: string, groupId: string, now: Date) {
  return tx.execute(sql`
    delete from sessions
    where workspace_id = ${workspaceId} and group_id = ${groupId}
      and status = 'scheduled' and starts_at = slot_starts_at
      and starts_at > ${now.toISOString()}::timestamptz`);
}
