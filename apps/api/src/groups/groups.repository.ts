import { Injectable } from '@nestjs/common';
import { aliasedTable, and, asc, eq, inArray } from 'drizzle-orm';
import type { Group, GroupSlot, UpdateGroupRequest, Workspace } from '@dafter/contracts';
import {
  assistantScopes,
  gradeLevels,
  groupSlots,
  groups,
  memberships,
  subjects,
  type Tx,
  users,
} from '@dafter/db';
import { dropGeneratedSessions, generateSessions } from '../sessions/generate.js';
import { TenantRepository } from '../tenant.repository.js';

type Role = Workspace['role'];
export type GroupValues = Pick<
  typeof groups.$inferInsert,
  'teacherMembershipId' | 'subjectId' | 'gradeLevelId' | 'capacity' | 'monthlyFeePiastres'
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
    const { teacherMembershipId: t, subjectId: s, gradeLevelId: g } = values;
    return this.inTenant(workspaceId, async (tx) => {
      const [teacher] = t
        ? await tx
            .select({ role: memberships.role })
            .from(memberships)
            .where(and(eq(memberships.workspaceId, workspaceId), eq(memberships.id, t)))
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
      return {
        teacherRole: teacher?.role as Role | undefined,
        subject: !!subjectRow,
        gradeLevel: !!gradeRow,
      };
    });
  }

  create(workspaceId: string, values: GroupValues, slots: GroupSlot[], now: Date) {
    return this.inTenant(workspaceId, async (tx) => {
      const [row] = await tx
        .insert(groups)
        .values({ workspaceId, ...values })
        .returning({ id: groups.id });
      await this.insertSlots(tx, workspaceId, row!.id, slots);
      await generateSessions(tx, workspaceId, now, row!.id);
      return row!.id;
    });
  }

  /**
   * Updates the group; `slots`, when given, replace all of its slots in the same transaction.
   * New slots or a status change regenerate the group's untouched future sessions.
   */
  update(
    workspaceId: string,
    id: string,
    patch: Omit<UpdateGroupRequest, 'slots'>,
    slots: GroupSlot[] | undefined,
    now: Date,
  ) {
    return this.inTenant(workspaceId, async (tx) => {
      if (Object.keys(patch).length)
        await tx
          .update(groups)
          .set(patch)
          .where(and(eq(groups.workspaceId, workspaceId), eq(groups.id, id)));
      if (slots) {
        await tx
          .delete(groupSlots)
          .where(and(eq(groupSlots.workspaceId, workspaceId), eq(groupSlots.groupId, id)));
        await this.insertSlots(tx, workspaceId, id, slots);
      }
      if (slots || patch.status) {
        await dropGeneratedSessions(tx, workspaceId, id, now);
        await generateSessions(tx, workspaceId, now, id);
      }
    });
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
        subject: item(subject),
        gradeLevel: item(grade),
        capacity: groups.capacity,
        monthlyFeePiastres: groups.monthlyFeePiastres,
        status: groups.status,
      })
      .from(groups)
      .innerJoin(subject, eq(subject.id, groups.subjectId))
      .innerJoin(grade, eq(grade.id, groups.gradeLevelId))
      .innerJoin(memberships, eq(memberships.id, groups.teacherMembershipId))
      .innerJoin(users, eq(users.id, memberships.userId))
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
