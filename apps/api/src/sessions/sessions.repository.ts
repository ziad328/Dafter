import { Injectable } from '@nestjs/common';
import { aliasedTable, and, asc, eq, inArray, type SQL, sql } from 'drizzle-orm';
import type { MoveSessionRequest, Session } from '@dafter/contracts';
import {
  gradeLevels,
  groups,
  memberships,
  rooms,
  sessions,
  subjects,
  type Tx,
  users,
  workspaces,
} from '@dafter/db';
import { AppError } from '../errors.js';
import { enqueueSessionChange } from '../messages/outbox.js';
import { roomBooked } from '../rooms/pg-errors.js';
import { TenantRepository } from '../tenant.repository.js';

const subject = aliasedTable(subjects, 's');
const grade = aliasedTable(gradeLevels, 'g');
const item = (t: typeof subject | typeof grade) => ({
  id: t.id,
  nameAr: t.nameAr,
  nameEn: t.nameEn,
});

/** A local date + "HH:MM" in the workspace timezone, as a UTC instant. */
const local = (date: string, time: string) =>
  sql`(${date}::date + ${time}::time) at time zone ${workspaces.timezone}`;

@Injectable()
export class SessionsRepository extends TenantRepository {
  /** Sessions starting on local dates `from`..`to` (inclusive) of the given teachers' groups. */
  list(workspaceId: string, from: string, to: string, teacherIds?: string[]): Promise<Session[]> {
    if (teacherIds?.length === 0) return Promise.resolve([]);
    return this.inTenant(workspaceId, (tx) =>
      this.select(
        tx,
        workspaceId,
        and(
          sql`${sessions.startsAt} >= ${local(from, '00:00')}`,
          sql`${sessions.startsAt} < (${to}::date + 1)::timestamp at time zone ${workspaces.timezone}`,
          teacherIds && inArray(groups.teacherMembershipId, teacherIds),
        ),
      ),
    );
  }

  async find(workspaceId: string, id: string): Promise<Session | undefined> {
    const [row] = await this.inTenant(workspaceId, (tx) =>
      this.select(tx, workspaceId, eq(sessions.id, id)),
    );
    return row;
  }

  /** Cancels a scheduled session and tells the parents (same transaction); false when not scheduled. */
  cancel(workspaceId: string, id: string, now: Date) {
    return this.inTenant(workspaceId, async (tx) => {
      const rows = await tx
        .update(sessions)
        .set({ status: 'cancelled' })
        .where(this.scheduled(workspaceId, id))
        .returning({ id: sessions.id });
      if (rows.length) await enqueueSessionChange(tx, workspaceId, id, now, 'session_cancelled');
      return rows.length > 0;
    });
  }

  /** Moves a scheduled session to a future local time and tells the parents; false when the new start has passed. */
  move(workspaceId: string, id: string, to: MoveSessionRequest, now: Date) {
    return this.inTenant(workspaceId, async (tx) => {
      // Saving the same time again is a no-op: no update, no "session moved" message to parents.
      const [same] = await tx
        .select({ id: sessions.id })
        .from(sessions)
        .innerJoin(workspaces, eq(workspaces.id, sessions.workspaceId))
        .where(
          and(
            this.scheduled(workspaceId, id),
            sql`${sessions.startsAt} = ${local(to.date, to.startTime)}`,
            sql`${sessions.endsAt} = ${local(to.date, to.endTime)}`,
          ),
        );
      if (same) return true;
      await this.lockTeacher(tx, workspaceId, id);
      // The old start, for «حصة السبت 4:00 م أصبحت الأحد 5:00 م».
      const [old] = await tx
        .select({ startsAt: sessions.startsAt })
        .from(sessions)
        .where(this.scheduled(workspaceId, id));
      const rows = await tx
        .update(sessions)
        .set({
          startsAt: local(to.date, to.startTime),
          endsAt: local(to.date, to.endTime),
        })
        .from(workspaces)
        .where(
          and(
            this.scheduled(workspaceId, id),
            eq(workspaces.id, sessions.workspaceId),
            sql`${local(to.date, to.startTime)} > ${now.toISOString()}::timestamptz`,
          ),
        )
        .returning({ id: sessions.id });
      if (!rows.length) return false;
      if (!to.force) await this.checkTeacher(tx, workspaceId, id);
      await enqueueSessionChange(tx, workspaceId, id, now, 'session_moved', old!.startsAt);
      return true;
    }).catch(roomBooked);
  }

  /**
   * Moves of one teacher's sessions run one after the other (a transaction-scoped advisory lock
   * on the teacher's membership), so two moves into the same free hour can't both pass the check.
   */
  private async lockTeacher(tx: Tx, workspaceId: string, sessionId: string) {
    await tx.execute(sql`
      select pg_advisory_xact_lock(hashtextextended(g.teacher_membership_id::text, 0))
      from sessions s join groups g on g.workspace_id = s.workspace_id and g.id = s.group_id
      where s.workspace_id = ${workspaceId} and s.id = ${sessionId}`);
  }

  /**
   * TEACHER_BOOKED with the first clash when, after the move, the session overlaps another
   * non-cancelled session of a group with the same teacher. Throwing rolls the move back.
   * Touching sessions (one ends 17:30, the next starts 17:30) are fine.
   */
  private async checkTeacher(tx: Tx, workspaceId: string, sessionId: string) {
    const { rows } = await tx.execute<{ date: string; startTime: string; endTime: string }>(sql`
      select to_char(o.starts_at at time zone w.timezone, 'YYYY-MM-DD') as date,
        to_char(o.starts_at at time zone w.timezone, 'HH24:MI') as "startTime",
        to_char(o.ends_at at time zone w.timezone, 'HH24:MI') as "endTime"
      from sessions s
      join workspaces w on w.id = s.workspace_id
      join groups g on g.workspace_id = s.workspace_id and g.id = s.group_id
      join groups og on og.workspace_id = g.workspace_id
        and og.teacher_membership_id = g.teacher_membership_id
      join sessions o on o.workspace_id = og.workspace_id and o.group_id = og.id
      where s.workspace_id = ${workspaceId} and s.id = ${sessionId}
        and o.id <> s.id and o.status <> 'cancelled'
        and o.starts_at < s.ends_at and s.starts_at < o.ends_at
      order by o.starts_at
      limit 1`);
    if (rows[0]) throw new AppError('TEACHER_BOOKED', { ...rows[0] });
  }

  private scheduled(workspaceId: string, id: string) {
    return and(
      eq(sessions.workspaceId, workspaceId),
      eq(sessions.id, id),
      eq(sessions.status, 'scheduled'),
    );
  }

  private async select(tx: Tx, workspaceId: string, filter?: SQL) {
    const rows = await tx
      .select({
        id: sessions.id,
        groupId: sessions.groupId,
        startsAt: sessions.startsAt,
        endsAt: sessions.endsAt,
        status: sessions.status,
        moved: sql<boolean>`${sessions.startsAt} <> ${sessions.slotStartsAt}`,
        teacherMembershipId: groups.teacherMembershipId,
        teacherName: users.name,
        subject: item(subject),
        gradeLevel: item(grade),
        groupLabel: groups.label,
        room: { id: rooms.id, name: rooms.name },
      })
      .from(sessions)
      .innerJoin(workspaces, eq(workspaces.id, sessions.workspaceId))
      .innerJoin(groups, eq(groups.id, sessions.groupId))
      .innerJoin(subject, eq(subject.id, groups.subjectId))
      .innerJoin(grade, eq(grade.id, groups.gradeLevelId))
      .innerJoin(memberships, eq(memberships.id, groups.teacherMembershipId))
      .innerJoin(users, eq(users.id, memberships.userId))
      .leftJoin(rooms, eq(rooms.id, sessions.roomId))
      .where(and(eq(sessions.workspaceId, workspaceId), filter))
      .orderBy(asc(sessions.startsAt));
    return rows.map((r) => ({
      ...r,
      startsAt: r.startsAt.toISOString(),
      endsAt: r.endsAt.toISOString(),
    }));
  }
}
