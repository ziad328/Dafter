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
      if (rows.length) await enqueueSessionChange(tx, workspaceId, id, now, 'session_moved');
      return rows.length > 0;
    }).catch(roomBooked);
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
