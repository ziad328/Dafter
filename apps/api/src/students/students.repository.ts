import { Injectable } from '@nestjs/common';
import {
  aliasedTable,
  and,
  asc,
  desc,
  eq,
  exists,
  ilike,
  inArray,
  isNull,
  like,
  or,
  type SQL,
  sql,
} from 'drizzle-orm';
import type { Enrollment, GuardianInput, Student } from '@dafter/contracts';
import {
  enrollments,
  gradeLevels,
  groups,
  guardians,
  memberships,
  refreshTokens,
  studentDevices,
  studentGuardians,
  studentInvites,
  students,
  subjects,
  type Tx,
  users,
} from '@dafter/db';
import { TenantRepository } from '../tenant.repository.js';

type StudentValues = Omit<typeof students.$inferInsert, 'workspaceId'>;

// shortcut: first 50 matches, no cursor; add one when a center has thousands of students.
const LIMIT = 50;

const groupGrade = aliasedTable(gradeLevels, 'eg');

@Injectable()
export class StudentsRepository extends TenantRepository {
  async gradeExists(workspaceId: string, id: string) {
    const rows = await this.inTenant(workspaceId, (tx) =>
      tx
        .select({ id: gradeLevels.id })
        .from(gradeLevels)
        .where(and(eq(gradeLevels.workspaceId, workspaceId), eq(gradeLevels.id, id))),
    );
    return rows.length > 0;
  }

  /**
   * `q` is already normalized. Digits: prefix of the student's or a parent's phone. Text: the
   * normalized name contains it, or is close by trigram word similarity (typos).
   */
  search(workspaceId: string, q: string): Promise<Student[]> {
    return this.inTenant(workspaceId, (tx) => {
      if (!q) return this.select(tx, workspaceId, undefined, [desc(students.createdAt)]);
      if (/^\d+$/.test(q)) {
        const parent = tx
          .select({ one: sql`1` })
          .from(studentGuardians)
          .innerJoin(guardians, eq(guardians.id, studentGuardians.guardianId))
          .where(and(eq(studentGuardians.studentId, students.id), like(guardians.phone, `${q}%`)));
        return this.select(tx, workspaceId, or(like(students.phone, `${q}%`), exists(parent)), [
          asc(students.nameSearch),
        ]);
      }
      const contains = `%${q.replace(/[\\%_]/g, (c) => `\\${c}`)}%`;
      return this.select(
        tx,
        workspaceId,
        or(ilike(students.nameSearch, contains), sql`${q} <% ${students.nameSearch}`),
        [desc(sql`word_similarity(${q}, ${students.nameSearch})`), asc(students.nameSearch)],
      );
    });
  }

  async find(workspaceId: string, id: string): Promise<Student | undefined> {
    const [row] = await this.inTenant(workspaceId, (tx) =>
      this.select(tx, workspaceId, eq(students.id, id)),
    );
    return row;
  }

  create(workspaceId: string, values: StudentValues, guardian: GuardianInput) {
    return this.inTenant(workspaceId, async (tx) => {
      const [row] = await tx
        .insert(students)
        .values({ workspaceId, ...values })
        .returning({ id: students.id });
      await this.setPrimaryGuardian(tx, workspaceId, row!.id, guardian);
      return row!.id;
    });
  }

  update(
    workspaceId: string,
    id: string,
    patch: Partial<StudentValues>,
    guardian: GuardianInput | undefined,
  ) {
    return this.inTenant(workspaceId, async (tx) => {
      await tx
        .update(students)
        .set(patch)
        .where(and(eq(students.workspaceId, workspaceId), eq(students.id, id)));
      if (guardian) await this.setPrimaryGuardian(tx, workspaceId, id, guardian);
    });
  }

  /** A new link replaces older unused ones, so only the latest one handed out works. */
  createInvite(
    workspaceId: string,
    studentId: string,
    tokenHash: string,
    now: Date,
    expiresAt: Date,
  ) {
    return this.inTenant(workspaceId, async (tx) => {
      await tx
        .update(studentInvites)
        .set({ usedAt: now })
        .where(
          and(
            eq(studentInvites.workspaceId, workspaceId),
            eq(studentInvites.studentId, studentId),
            isNull(studentInvites.usedAt),
          ),
        );
      await tx.insert(studentInvites).values({ workspaceId, studentId, tokenHash, expiresAt });
    });
  }

  /**
   * Revokes the student's phone and every refresh token of their login in one transaction, so a
   * lost phone is also signed out. The login is shared across centers, so this applies to all.
   */
  resetDevice(workspaceId: string, studentId: string, actorId: string, now: Date) {
    return this.inTenant(workspaceId, async (tx) => {
      const [row] = await tx
        .select({ userId: students.userId })
        .from(students)
        .where(and(eq(students.workspaceId, workspaceId), eq(students.id, studentId)));
      if (!row) return false;
      if (!row.userId) return true;
      await tx
        .update(studentDevices)
        .set({ revokedAt: now, revokedBy: actorId })
        .where(and(eq(studentDevices.userId, row.userId), isNull(studentDevices.revokedAt)));
      await tx
        .update(refreshTokens)
        .set({ revokedAt: now })
        .where(and(eq(refreshTokens.userId, row.userId), isNull(refreshTokens.revokedAt)));
      return true;
    });
  }

  enrollments(
    workspaceId: string,
    studentId: string,
    enrollmentId?: string,
  ): Promise<Enrollment[]> {
    return this.inTenant(workspaceId, async (tx) => {
      const rows = await tx
        .select({
          id: enrollments.id,
          groupId: enrollments.groupId,
          subject: { id: subjects.id, nameAr: subjects.nameAr, nameEn: subjects.nameEn },
          gradeLevel: { id: groupGrade.id, nameAr: groupGrade.nameAr, nameEn: groupGrade.nameEn },
          teacherName: users.name,
          discountPct: enrollments.discountPct,
          status: enrollments.status,
          joinedAt: enrollments.joinedAt,
          leftAt: enrollments.leftAt,
        })
        .from(enrollments)
        .innerJoin(groups, eq(groups.id, enrollments.groupId))
        .innerJoin(subjects, eq(subjects.id, groups.subjectId))
        .innerJoin(groupGrade, eq(groupGrade.id, groups.gradeLevelId))
        .innerJoin(memberships, eq(memberships.id, groups.teacherMembershipId))
        .innerJoin(users, eq(users.id, memberships.userId))
        .where(
          and(
            eq(enrollments.workspaceId, workspaceId),
            eq(enrollments.studentId, studentId),
            enrollmentId ? eq(enrollments.id, enrollmentId) : undefined,
          ),
        )
        // Active first, then newest.
        .orderBy(asc(enrollments.status), desc(enrollments.joinedAt));
      return rows.map((r) => ({
        ...r,
        joinedAt: r.joinedAt.toISOString(),
        leftAt: r.leftAt?.toISOString() ?? null,
      }));
    });
  }

  async enroll(
    workspaceId: string,
    values: { studentId: string; groupId: string; discountPct: number; joinedAt: Date },
  ) {
    const [row] = await this.inTenant(workspaceId, (tx) =>
      tx
        .insert(enrollments)
        .values({ workspaceId, ...values })
        .onConflictDoNothing()
        .returning({ id: enrollments.id }),
    );
    return row?.id;
  }

  async leave(workspaceId: string, studentId: string, enrollmentId: string, now: Date) {
    const rows = await this.inTenant(workspaceId, (tx) =>
      tx
        .update(enrollments)
        .set({ status: 'left', leftAt: now })
        .where(
          and(
            eq(enrollments.workspaceId, workspaceId),
            eq(enrollments.studentId, studentId),
            eq(enrollments.id, enrollmentId),
            eq(enrollments.status, 'active'),
          ),
        )
        .returning({ id: enrollments.id }),
    );
    return rows.length > 0;
  }

  /**
   * Finds the guardian by phone (a sibling's parent is reused and their details refreshed) or
   * creates one, then makes it the student's only primary guardian. The old primary link is
   * dropped (most likely a wrong number); the guardian row stays for its other students.
   */
  private async setPrimaryGuardian(
    tx: Tx,
    workspaceId: string,
    studentId: string,
    g: GuardianInput,
  ) {
    const [row] = await tx
      .insert(guardians)
      .values({ workspaceId, ...g })
      .onConflictDoUpdate({
        target: [guardians.workspaceId, guardians.phone],
        set: {
          name: sql`coalesce(excluded.name, ${guardians.name})`,
          relation: sql`excluded.relation`,
          preferredLocale: sql`excluded.preferred_locale`,
          whatsappOptIn: sql`excluded.whatsapp_opt_in`,
        },
      })
      .returning({ id: guardians.id });
    const link = and(
      eq(studentGuardians.workspaceId, workspaceId),
      eq(studentGuardians.studentId, studentId),
    );
    await tx.delete(studentGuardians).where(and(link, eq(studentGuardians.isPrimary, true)));
    await tx
      .insert(studentGuardians)
      .values({ workspaceId, studentId, guardianId: row!.id, isPrimary: true })
      .onConflictDoUpdate({
        target: [
          studentGuardians.workspaceId,
          studentGuardians.studentId,
          studentGuardians.guardianId,
        ],
        set: { isPrimary: true },
      });
  }

  private async select(tx: Tx, workspaceId: string, filter?: SQL, order: SQL[] = []) {
    const rows = await tx
      .select({
        id: students.id,
        nameAr: students.nameAr,
        nameEn: students.nameEn,
        phone: students.phone,
        gradeLevel: { id: gradeLevels.id, nameAr: gradeLevels.nameAr, nameEn: gradeLevels.nameEn },
        school: students.school,
        status: students.status,
        activated: sql<boolean>`${students.userId} is not null`,
        deviceBound: sql<boolean>`exists (select 1 from ${studentDevices} where ${studentDevices.userId} = ${students.userId} and ${studentDevices.revokedAt} is null)`,
      })
      .from(students)
      .innerJoin(gradeLevels, eq(gradeLevels.id, students.gradeLevelId))
      .where(and(eq(students.workspaceId, workspaceId), filter))
      // Active first (enum order), then the caller's order.
      .orderBy(asc(students.status), ...order)
      .limit(LIMIT);
    if (!rows.length) return [];
    const links = await tx
      .select({
        studentId: studentGuardians.studentId,
        id: guardians.id,
        name: guardians.name,
        phone: guardians.phone,
        relation: guardians.relation,
        preferredLocale: guardians.preferredLocale,
        whatsappOptIn: guardians.whatsappOptIn,
        isPrimary: studentGuardians.isPrimary,
      })
      .from(studentGuardians)
      .innerJoin(guardians, eq(guardians.id, studentGuardians.guardianId))
      .where(
        and(
          eq(studentGuardians.workspaceId, workspaceId),
          inArray(
            studentGuardians.studentId,
            rows.map((r) => r.id),
          ),
        ),
      )
      .orderBy(desc(studentGuardians.isPrimary));
    return rows.map((r) => ({
      ...r,
      guardians: links
        .filter((l) => l.studentId === r.id)
        .map((l) => ({
          id: l.id,
          name: l.name,
          phone: l.phone,
          relation: l.relation,
          preferredLocale: l.preferredLocale,
          whatsappOptIn: l.whatsappOptIn,
          isPrimary: l.isPrimary,
        })),
    }));
  }
}
