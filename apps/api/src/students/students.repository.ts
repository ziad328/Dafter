import { Injectable } from '@nestjs/common';
import { and, asc, desc, eq, exists, ilike, inArray, like, or, type SQL, sql } from 'drizzle-orm';
import type { GuardianInput, Student } from '@dafter/contracts';
import { gradeLevels, guardians, studentGuardians, students, type Tx } from '@dafter/db';
import { TenantRepository } from '../tenant.repository.js';

type StudentValues = Omit<typeof students.$inferInsert, 'workspaceId'>;

// shortcut: first 50 matches, no cursor; add one when a center has thousands of students.
const LIMIT = 50;

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
