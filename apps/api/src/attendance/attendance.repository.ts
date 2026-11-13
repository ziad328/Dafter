import { Injectable } from '@nestjs/common';
import { and, asc, eq, isNull, sql } from 'drizzle-orm';
import type { AttendanceRecord, MarkAttendanceRequest } from '@dafter/contracts';
import {
  attendanceRecords,
  enrollments,
  sessions,
  studentDevices,
  students,
  type Tx,
  workspaces,
} from '@dafter/db';
import { TenantRepository } from '../tenant.repository.js';

type Status = MarkAttendanceRequest['status'];
const DEFAULT_LATE_MINUTES = 15;

@Injectable()
export class AttendanceRepository extends TenantRepository {
  /** scheduled -> open; an already open session stays as it is. False when neither. */
  async open(workspaceId: string, id: string, now: Date) {
    return this.inTenant(workspaceId, async (tx) => {
      const where = and(eq(sessions.workspaceId, workspaceId), eq(sessions.id, id));
      const [opened] = await tx
        .update(sessions)
        .set({ status: 'open', openedAt: now })
        .where(and(where, eq(sessions.status, 'scheduled')))
        .returning({ id: sessions.id });
      if (opened) return true;
      const [row] = await tx.select({ status: sessions.status }).from(sessions).where(where);
      return row?.status === 'open';
    });
  }

  /**
   * The check-in's session, found by id across workspaces (the student's token names no
   * workspace). The third documented read outside RLS; the id came from a code whose MAC the
   * caller already verified.
   */
  async sessionForCheckIn(id: string) {
    const [row] = await this.db
      .select({
        workspaceId: sessions.workspaceId,
        groupId: sessions.groupId,
        status: sessions.status,
        startsAt: sessions.startsAt,
        lateAfterMinutes: sql<number>`coalesce((${workspaces.settings}->>'lateAfterMinutes')::int, ${DEFAULT_LATE_MINUTES})`,
      })
      .from(sessions)
      .innerJoin(workspaces, eq(workspaces.id, sessions.workspaceId))
      .where(eq(sessions.id, id));
    return row;
  }

  async activeDevice(userId: string) {
    const [row] = await this.db
      .select({ id: studentDevices.id, publicKey: studentDevices.publicKey })
      .from(studentDevices)
      .where(and(eq(studentDevices.userId, userId), isNull(studentDevices.revokedAt)));
    return row;
  }

  /**
   * Records a scan for the signed-in student's record in this workspace. Status comes from the
   * enrollment (else make-up) and the late threshold. A repeat returns the first record.
   */
  scan(
    workspaceId: string,
    s: { sessionId: string; groupId: string; lateAt: Date },
    userId: string,
    proof: { deviceId: string; qrWindow: number },
    now: Date,
  ) {
    return this.inTenant(workspaceId, async (tx) => {
      const [student] = await tx
        .select({ id: students.id })
        .from(students)
        .where(and(eq(students.workspaceId, workspaceId), eq(students.userId, userId)))
        .orderBy(asc(students.status), asc(students.createdAt))
        .limit(1);
      if (!student) return undefined;
      const [enrolled] = await tx
        .select({ id: enrollments.id })
        .from(enrollments)
        .where(
          and(
            eq(enrollments.workspaceId, workspaceId),
            eq(enrollments.studentId, student.id),
            eq(enrollments.groupId, s.groupId),
            eq(enrollments.status, 'active'),
          ),
        );
      const status: Status = !enrolled ? 'makeup' : now > s.lateAt ? 'late' : 'present';
      await tx
        .insert(attendanceRecords)
        .values({
          workspaceId,
          sessionId: s.sessionId,
          studentId: student.id,
          status,
          method: 'student_scan',
          recordedAt: now,
          ...proof,
        })
        .onConflictDoNothing();
      return this.record(tx, workspaceId, s.sessionId, student.id);
    });
  }

  async studentExists(workspaceId: string, studentId: string) {
    const rows = await this.inTenant(workspaceId, (tx) =>
      tx
        .select({ id: students.id })
        .from(students)
        .where(and(eq(students.workspaceId, workspaceId), eq(students.id, studentId))),
    );
    return rows.length > 0;
  }

  /** A manual mark replaces whatever is there (a scan, auto-close or an earlier mark). */
  mark(
    workspaceId: string,
    sessionId: string,
    studentId: string,
    status: Status,
    actorId: string,
    now: Date,
  ) {
    return this.inTenant(workspaceId, async (tx) => {
      const values = {
        status,
        method: 'manual' as const,
        recordedBy: actorId,
        recordedAt: now,
        deviceId: null,
        qrWindow: null,
      };
      await tx
        .insert(attendanceRecords)
        .values({ workspaceId, sessionId, studentId, ...values })
        .onConflictDoUpdate({
          target: [
            attendanceRecords.workspaceId,
            attendanceRecords.sessionId,
            attendanceRecords.studentId,
          ],
          set: values,
        });
      return (await this.list(tx, workspaceId, sessionId, studentId))[0]!;
    });
  }

  listForSession(workspaceId: string, sessionId: string) {
    return this.inTenant(workspaceId, (tx) => this.list(tx, workspaceId, sessionId));
  }

  private async record(tx: Tx, workspaceId: string, sessionId: string, studentId: string) {
    const [row] = await tx
      .select({
        id: attendanceRecords.id,
        status: attendanceRecords.status,
        recordedAt: attendanceRecords.recordedAt,
      })
      .from(attendanceRecords)
      .where(
        and(
          eq(attendanceRecords.workspaceId, workspaceId),
          eq(attendanceRecords.sessionId, sessionId),
          eq(attendanceRecords.studentId, studentId),
        ),
      );
    return row!;
  }

  private async list(
    tx: Tx,
    workspaceId: string,
    sessionId: string,
    studentId?: string,
  ): Promise<AttendanceRecord[]> {
    const rows = await tx
      .select({
        id: attendanceRecords.id,
        studentId: attendanceRecords.studentId,
        nameAr: students.nameAr,
        nameEn: students.nameEn,
        status: attendanceRecords.status,
        method: attendanceRecords.method,
        recordedAt: attendanceRecords.recordedAt,
      })
      .from(attendanceRecords)
      .innerJoin(students, eq(students.id, attendanceRecords.studentId))
      .where(
        and(
          eq(attendanceRecords.workspaceId, workspaceId),
          eq(attendanceRecords.sessionId, sessionId),
          studentId ? eq(attendanceRecords.studentId, studentId) : undefined,
        ),
      )
      .orderBy(asc(attendanceRecords.recordedAt));
    return rows.map((r) => ({ ...r, recordedAt: r.recordedAt.toISOString() }));
  }
}
