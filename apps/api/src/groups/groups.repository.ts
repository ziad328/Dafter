import { Injectable } from '@nestjs/common';
import { aliasedTable, and, asc, eq, inArray, type SQL, sql } from 'drizzle-orm';
import type { Group, GroupSlot, UpdateGroupRequest, Workspace } from '@dafter/contracts';
import {
  assistantScopes,
  enrollments,
  gradeLevels,
  groupSlots,
  groups,
  memberships,
  rooms,
  sessions,
  subjects,
  type Tx,
  users,
} from '@dafter/db';
import { AppError } from '../errors.js';
import { roomBooked } from '../rooms/pg-errors.js';
import { dropGeneratedSessions, generateSessions } from '../sessions/generate.js';
import { TenantRepository } from '../tenant.repository.js';

type Role = Workspace['role'];
export type GroupValues = Pick<
  typeof groups.$inferInsert,
  | 'teacherMembershipId'
  | 'subjectId'
  | 'gradeLevelId'
  | 'label'
  | 'capacity'
  | 'monthlyFeePiastres'
  | 'roomId'
>;

const subject = aliasedTable(subjects, 's');
const grade = aliasedTable(gradeLevels, 'g');

const item = (t: typeof subject | typeof grade) => ({
  id: t.id,
  nameAr: t.nameAr,
  nameEn: t.nameEn,
});

@Injectable()
export class GroupsRepository extends TenantRepository {
  curriculum(workspaceId: string, table: typeof subjects | typeof gradeLevels) {
    return this.inTenant(workspaceId, (tx) =>
      tx
        .select({ id: table.id, nameAr: table.nameAr, nameEn: table.nameEn })
        .from(table)
        .where(eq(table.workspaceId, workspaceId))
        .orderBy(asc(table.sortOrder)),
    );
  }

  /** The teachers whose groups an assistant works on. */
  async scopedTeachers(workspaceId: string, assistantMembershipId: string) {
    const rows = await this.inTenant(workspaceId, (tx) =>
      tx
        .select({ id: assistantScopes.teacherMembershipId })
        .from(assistantScopes)
        .where(
          and(
            eq(assistantScopes.workspaceId, workspaceId),
            eq(assistantScopes.membershipId, assistantMembershipId),
          ),
        ),
    );
    return rows.map((r) => r.id);
  }

  /** Groups of the given teachers (all teachers when `teacherIds` is undefined). */
  list(workspaceId: string, teacherIds?: string[]): Promise<Group[]> {
    if (teacherIds?.length === 0) return Promise.resolve([]);
    return this.inTenant(workspaceId, (tx) =>
      this.select(tx, workspaceId, teacherIds && inArray(groups.teacherMembershipId, teacherIds)),
    );
  }

  async find(workspaceId: string, id: string): Promise<Group | undefined> {
    const [row] = await this.inTenant(workspaceId, (tx) =>
      this.select(tx, workspaceId, eq(groups.id, id)),
    );
    return row;
  }

  /** Which of the references exist in this workspace; the teacher's role is returned to check. */
  references(workspaceId: string, values: Partial<GroupValues>) {
    const { teacherMembershipId: t, subjectId: s, gradeLevelId: g, roomId: r } = values;
    return this.inTenant(workspaceId, async (tx) => {
      const [teacher] = t
        ? await tx
            .select({ role: memberships.role })
            .from(memberships)
            .where(
              and(
                eq(memberships.workspaceId, workspaceId),
                eq(memberships.id, t),
                eq(memberships.status, 'active'),
              ),
            )
            // Held to the end of the request: a demotion or removal of this teacher waits.
            .for('share')
        : [];
      const [subjectRow] = s
        ? await tx
            .select({ id: subjects.id })
            .from(subjects)
            .where(and(eq(subjects.workspaceId, workspaceId), eq(subjects.id, s)))
        : [];
      const [gradeRow] = g
        ? await tx
            .select({ id: gradeLevels.id })
            .from(gradeLevels)
            .where(and(eq(gradeLevels.workspaceId, workspaceId), eq(gradeLevels.id, g)))
        : [];
      const [roomRow] = r
        ? await tx
            .select({ status: rooms.status })
            .from(rooms)
            .where(and(eq(rooms.workspaceId, workspaceId), eq(rooms.id, r)))
        : [];
      return {
        teacherRole: teacher?.role as Role | undefined,
        // Only an active room can be picked.
        room: roomRow?.status === 'active',
        subject: !!subjectRow,
        gradeLevel: !!gradeRow,
      };
    });
  }

  create(workspaceId: string, values: GroupValues, slots: GroupSlot[], now: Date, force = false) {
    return this.inTenant(workspaceId, async (tx) => {
      if (values.roomId) await this.checkRoom(tx, workspaceId, values.roomId, slots);
      if (!force) await this.checkTeacher(tx, workspaceId, values.teacherMembershipId, slots);
      const [row] = await tx
        .insert(groups)
        .values({ workspaceId, ...values })
        .returning({ id: groups.id });
      await this.insertSlots(tx, workspaceId, row!.id, slots);
      await generateSessions(tx, workspaceId, now, row!.id);
      return row!.id;
    }).catch(roomBooked);
  }

  /**
   * Updates the group; `slots`, when given, replace all of its slots in the same transaction.
   * New slots or a status change regenerate the group's untouched future sessions. A new room
   * moves the future scheduled sessions there; an active group's slots must fit its room, and
   * (unless `force`) its teacher's other groups.
   */
  update(
    workspaceId: string,
    id: string,
    patch: Omit<UpdateGroupRequest, 'slots'>,
    slots: GroupSlot[] | undefined,
    now: Date,
    force = false,
  ) {
    return this.inTenant(workspaceId, async (tx) => {
      const where = and(eq(groups.workspaceId, workspaceId), eq(groups.id, id));
      const [cur] = await tx
        .select({
          roomId: groups.roomId,
          status: groups.status,
          teacherId: groups.teacherMembershipId,
        })
        .from(groups)
        .where(where);
      const roomId = patch.roomId === undefined ? cur!.roomId : patch.roomId;
      const newRoom = patch.roomId !== undefined && patch.roomId !== cur!.roomId;
      const active = (patch.status ?? cur!.status) === 'active';
      // The group's slots after this save, read once for both checks.
      let all = slots;
      const after = async () => (all ??= await this.slotsOf(tx, workspaceId, id));
      if (roomId && active && (newRoom || slots || patch.status))
        await this.checkRoom(tx, workspaceId, roomId, await after(), id);
      const teacherId = patch.teacherMembershipId ?? cur!.teacherId;
      const newTeacher = teacherId !== cur!.teacherId;
      if (!force && active && (newTeacher || slots || patch.status))
        await this.checkTeacher(tx, workspaceId, teacherId, await after(), id);
      if (Object.keys(patch).length) await tx.update(groups).set(patch).where(where);
      if (slots) {
        await tx
          .delete(groupSlots)
          .where(and(eq(groupSlots.workspaceId, workspaceId), eq(groupSlots.groupId, id)));
        await this.insertSlots(tx, workspaceId, id, slots);
      }
      if (newRoom)
        await tx
          .update(sessions)
          .set({ roomId })
          .where(
            and(
              eq(sessions.workspaceId, workspaceId),
              eq(sessions.groupId, id),
              eq(sessions.status, 'scheduled'),
              sql`${sessions.startsAt} > ${now.toISOString()}::timestamptz`,
            ),
          );
      if (slots || patch.status) {
        await dropGeneratedSessions(tx, workspaceId, id, now);
        await generateSessions(tx, workspaceId, now, id);
      }
    }).catch(roomBooked);
  }

  /**
   * ROOM_BOOKED with the first clash when another active group in the room meets on the same
   * weekday at an overlapping local time. Touching slots (17:30 end, 17:30 start) are fine.
   * The room row is locked first, so two saves into one room run one after the other: the
   * second sees the first's committed slots instead of both passing the check.
   */
  private async checkRoom(
    tx: Tx,
    workspaceId: string,
    roomId: string,
    slots: GroupSlot[],
    exceptGroupId?: string,
  ) {
    await tx.execute(
      sql`select 1 from rooms where workspace_id = ${workspaceId} and id = ${roomId} for update`,
    );
    const clash = await this.firstClash(
      tx,
      workspaceId,
      sql`g.room_id = ${roomId}`,
      slots,
      exceptGroupId,
    );
    if (clash) throw new AppError('ROOM_BOOKED', { ...clash });
  }

  /**
   * TEACHER_BOOKED with the first clash when another active group of the same teacher meets on
   * the same weekday at an overlapping local time (touching is fine). A transaction advisory lock
   * on the teacher, the one session moves take, makes two saves for one teacher run in turn.
   */
  private async checkTeacher(
    tx: Tx,
    workspaceId: string,
    teacherId: string,
    slots: GroupSlot[],
    exceptGroupId?: string,
  ) {
    await tx.execute(sql`select pg_advisory_xact_lock(hashtextextended(${teacherId}::text, 0))`);
    const filter = sql`g.teacher_membership_id = ${teacherId}`;
    const clash = await this.firstClash(tx, workspaceId, filter, slots, exceptGroupId);
    if (clash) throw new AppError('TEACHER_BOOKED', { ...clash });
  }

  /**
   * The first slot of another active group (matching `filter`) that meets on the same weekday
   * at an overlapping local time as one of `slots`; touching slots (17:30 end, 17:30 start) are
   * fine.
   */
  private async firstClash(
    tx: Tx,
    workspaceId: string,
    filter: SQL,
    slots: GroupSlot[],
    exceptGroupId?: string,
  ) {
    const { rows } = await tx.execute<GroupSlot>(sql`
      select s.weekday, to_char(s.start_time, 'HH24:MI') as "startTime",
        to_char(s.end_time, 'HH24:MI') as "endTime"
      from group_slots s
      join groups g on g.workspace_id = s.workspace_id and g.id = s.group_id
      cross join jsonb_to_recordset(${JSON.stringify(slots)}::jsonb)
        as n(weekday int, "startTime" text, "endTime" text)
      where s.workspace_id = ${workspaceId} and ${filter} and g.status = 'active'
        ${exceptGroupId ? sql`and g.id <> ${exceptGroupId}` : sql``}
        and s.weekday = n.weekday
        and s.start_time < n."endTime"::time and n."startTime"::time < s.end_time
      order by s.weekday, s.start_time
      limit 1`);
    return rows[0];
  }

  private async slotsOf(tx: Tx, workspaceId: string, groupId: string): Promise<GroupSlot[]> {
    const rows = await tx
      .select()
      .from(groupSlots)
      .where(and(eq(groupSlots.workspaceId, workspaceId), eq(groupSlots.groupId, groupId)));
    return rows.map((r) => ({
      weekday: r.weekday,
      startTime: r.startTime.slice(0, 5),
      endTime: r.endTime.slice(0, 5),
    }));
  }

  private insertSlots(tx: Tx, workspaceId: string, groupId: string, slots: GroupSlot[]) {
    return tx.insert(groupSlots).values(slots.map((s) => ({ workspaceId, groupId, ...s })));
  }

  // shortcut: no pagination (a center has a few dozen groups); add a cursor when lists grow.
  private async select(tx: Tx, workspaceId: string, filter?: ReturnType<typeof eq>) {
    const rows = await tx
      .select({
        id: groups.id,
        teacherMembershipId: groups.teacherMembershipId,
        teacherName: users.name,
        teacherRemoved: sql<boolean>`${memberships.status} = 'removed'`,
        subject: item(subject),
        gradeLevel: item(grade),
        label: groups.label,
        capacity: groups.capacity,
        monthlyFeePiastres: groups.monthlyFeePiastres,
        room: { id: rooms.id, name: rooms.name },
        status: groups.status,
        studentCount: sql<number>`(
          select count(*)::int from ${enrollments}
          where ${enrollments.groupId} = ${groups.id} and ${enrollments.status} = 'active'
        )`.mapWith(Number),
      })
      .from(groups)
      .innerJoin(subject, eq(subject.id, groups.subjectId))
      .innerJoin(grade, eq(grade.id, groups.gradeLevelId))
      .innerJoin(memberships, eq(memberships.id, groups.teacherMembershipId))
      .innerJoin(users, eq(users.id, memberships.userId))
      .leftJoin(rooms, eq(rooms.id, groups.roomId))
      .where(and(eq(groups.workspaceId, workspaceId), filter))
      .orderBy(asc(grade.sortOrder), asc(subject.sortOrder), asc(groups.createdAt));
    if (!rows.length) return [];
    const slots = await tx
      .select()
      .from(groupSlots)
      .where(
        and(
          eq(groupSlots.workspaceId, workspaceId),
          inArray(
            groupSlots.groupId,
            rows.map((r) => r.id),
          ),
        ),
      )
      .orderBy(asc(groupSlots.weekday), asc(groupSlots.startTime));
    return rows.map((r) => ({
      ...r,
      // PostgreSQL returns "HH:MM:SS"; the contract is "HH:MM".
      slots: slots
        .filter((s) => s.groupId === r.id)
        .map((s) => ({
          weekday: s.weekday,
          startTime: s.startTime.slice(0, 5),
          endTime: s.endTime.slice(0, 5),
        })),
    }));
  }
}
