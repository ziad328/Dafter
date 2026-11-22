import { Inject, Injectable } from '@nestjs/common';
import { aliasedTable, and, desc, eq, gt, inArray, lt, sql } from 'drizzle-orm';
import type { MyAttendanceRecord, MyBalance, MyGrade, MySession } from '@dafter/contracts';
import {
  attendanceRecords,
  type Db,
  enrollments,
  examResults,
  exams,
  gradeLevels,
  groups,
  ledgerEntries,
  memberships,
  sessions,
  students,
  subjects,
  users,
  withTenant,
  workspaces,
} from '@dafter/db';
import { DB } from '../db.js';

const grade = aliasedTable(gradeLevels, 'g');
const item = (t: typeof subjects | typeof grade) => ({
  id: t.id,
  nameAr: t.nameAr,
  nameEn: t.nameEn,
});
const center = { nameAr: workspaces.nameAr, nameEn: workspaces.nameEn };

/**
 * The signed-in student's own data across centers. Their records are found by user_id as the
 * table owner (one login spans workspaces, like the device check); every read of a center's
 * rows then runs inside that center's withTenant.
 */
@Injectable()
export class MeRepository {
  constructor(@Inject(DB) private readonly db: Db) {}

  private async byWorkspace(userId: string) {
    const rows = await this.db
      .select({ workspaceId: students.workspaceId, id: students.id })
      .from(students)
      .where(eq(students.userId, userId));
    const map = new Map<string, string[]>();
    for (const r of rows) map.set(r.workspaceId, [...(map.get(r.workspaceId) ?? []), r.id]);
    return map;
  }

  async schedule(userId: string, from: Date, to: Date): Promise<MySession[]> {
    const out: MySession[] = [];
    for (const [workspaceId, studentIds] of await this.byWorkspace(userId)) {
      const rows = await withTenant(this.db, workspaceId, (tx) =>
        tx
          .selectDistinct({
            id: sessions.id,
            center,
            subject: item(subjects),
            gradeLevel: item(grade),
            groupLabel: groups.label,
            teacherName: users.name,
            startsAt: sessions.startsAt,
            endsAt: sessions.endsAt,
            status: sessions.status,
            timezone: workspaces.timezone,
          })
          .from(sessions)
          .innerJoin(workspaces, eq(workspaces.id, sessions.workspaceId))
          .innerJoin(groups, eq(groups.id, sessions.groupId))
          .innerJoin(
            enrollments,
            and(
              eq(enrollments.groupId, sessions.groupId),
              inArray(enrollments.studentId, studentIds),
              eq(enrollments.status, 'active'),
            ),
          )
          .innerJoin(subjects, eq(subjects.id, groups.subjectId))
          .innerJoin(grade, eq(grade.id, groups.gradeLevelId))
          .innerJoin(memberships, eq(memberships.id, groups.teacherMembershipId))
          .innerJoin(users, eq(users.id, memberships.userId))
          .where(
            and(
              eq(sessions.workspaceId, workspaceId),
              gt(sessions.endsAt, from),
              lt(sessions.startsAt, to),
            ),
          ),
      );
      out.push(
        ...rows.map((r) => ({
          ...r,
          startsAt: r.startsAt.toISOString(),
          endsAt: r.endsAt.toISOString(),
        })),
      );
    }
    return out.sort((a, b) => a.startsAt.localeCompare(b.startsAt));
  }

  async attendance(userId: string, limit: number): Promise<MyAttendanceRecord[]> {
    const out: MyAttendanceRecord[] = [];
    for (const [workspaceId, studentIds] of await this.byWorkspace(userId)) {
      const rows = await withTenant(this.db, workspaceId, (tx) =>
        tx
          .select({
            sessionId: attendanceRecords.sessionId,
            center,
            subject: item(subjects),
            startsAt: sessions.startsAt,
            timezone: workspaces.timezone,
            status: attendanceRecords.status,
          })
          .from(attendanceRecords)
          .innerJoin(sessions, eq(sessions.id, attendanceRecords.sessionId))
          .innerJoin(workspaces, eq(workspaces.id, attendanceRecords.workspaceId))
          .innerJoin(groups, eq(groups.id, sessions.groupId))
          .innerJoin(subjects, eq(subjects.id, groups.subjectId))
          .where(
            and(
              eq(attendanceRecords.workspaceId, workspaceId),
              inArray(attendanceRecords.studentId, studentIds),
            ),
          )
          .orderBy(desc(sessions.startsAt))
          .limit(limit),
      );
      out.push(...rows.map((r) => ({ ...r, startsAt: r.startsAt.toISOString() })));
    }
    return out.sort((a, b) => b.startsAt.localeCompare(a.startsAt)).slice(0, limit);
  }

  async grades(userId: string, limit: number): Promise<MyGrade[]> {
    const out: MyGrade[] = [];
    for (const [workspaceId, studentIds] of await this.byWorkspace(userId)) {
      const rows = await withTenant(this.db, workspaceId, (tx) =>
        tx
          .select({
            examId: exams.id,
            center,
            subject: item(subjects),
            title: exams.title,
            heldOn: exams.heldOn,
            maxScore: exams.maxScore,
            score: examResults.score,
            absent: examResults.absent,
          })
          .from(examResults)
          .innerJoin(exams, eq(exams.id, examResults.examId))
          .innerJoin(workspaces, eq(workspaces.id, examResults.workspaceId))
          .innerJoin(groups, eq(groups.id, exams.groupId))
          .innerJoin(subjects, eq(subjects.id, groups.subjectId))
          .where(
            and(
              eq(examResults.workspaceId, workspaceId),
              inArray(examResults.studentId, studentIds),
            ),
          )
          .orderBy(desc(exams.heldOn))
          .limit(limit),
      );
      out.push(...rows);
    }
    return out.sort((a, b) => b.heldOn.localeCompare(a.heldOn)).slice(0, limit);
  }

  /**
   * My balance in each center where I have entries (all my groups: it is my own money), with the
   * last `limit` entries. Centers are in the order they were joined.
   */
  async balance(userId: string, limit: number): Promise<MyBalance[]> {
    const out: MyBalance[] = [];
    for (const [workspaceId, studentIds] of await this.byWorkspace(userId)) {
      const mine = and(
        eq(ledgerEntries.workspaceId, workspaceId),
        inArray(ledgerEntries.studentId, studentIds),
      );
      const found = await withTenant(this.db, workspaceId, async (tx) => {
        const [total] = await tx
          .select({
            center,
            balance: sql<string>`sum(${ledgerEntries.amountPiastres})`,
          })
          .from(ledgerEntries)
          .innerJoin(workspaces, eq(workspaces.id, ledgerEntries.workspaceId))
          .where(mine)
          .groupBy(workspaces.id);
        if (!total) return undefined;
        const entries = await tx
          .select({
            id: ledgerEntries.id,
            type: ledgerEntries.type,
            amountPiastres: ledgerEntries.amountPiastres,
            method: ledgerEntries.method,
            receiptNo: ledgerEntries.receiptNo,
            period: ledgerEntries.period,
            subject: item(subjects),
            createdAt: ledgerEntries.createdAt,
          })
          .from(ledgerEntries)
          .innerJoin(groups, eq(groups.id, ledgerEntries.groupId))
          .innerJoin(subjects, eq(subjects.id, groups.subjectId))
          .where(mine)
          .orderBy(desc(ledgerEntries.createdAt), desc(ledgerEntries.id))
          .limit(limit);
        return {
          center: total.center,
          balancePiastres: Number(total.balance),
          entries: entries.map((e) => ({ ...e, createdAt: e.createdAt.toISOString() })),
        };
      });
      if (found) out.push(found);
    }
    return out;
  }
}
