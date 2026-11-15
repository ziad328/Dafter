import { Injectable } from '@nestjs/common';
import { and, asc, eq, isNull, lte, sql } from 'drizzle-orm';
import type {
  AttendanceRecord,
  AttendanceSettings,
  MarkAttendanceRequest,
  RosterEntry,
} from '@dafter/contracts';
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
import { enqueueAbsences } from '../messages/outbox.js';

type Status = MarkAttendanceRequest['status'];
const DEFAULT_LATE_MINUTES = 15;
/** A session opens at most this long before its start (the door opens before class). */
export const OPEN_EARLY_MS = 30 * 60_000;

@Injectable()
export class AttendanceRepository extends TenantRepository {
  async settings(workspaceId: string): Promise<AttendanceSettings> {
    const [row] = await this.inTenant(workspaceId, (tx) =>
      tx
        .select({
          lateAfterMinutes: sql<number>`coalesce((${workspaces.settings}->>'lateAfterMinutes')::int, ${DEFAULT_LATE_MINUTES})`,
        })
        .from(workspaces)
        .where(eq(workspaces.id, workspaceId)),
    );
    return row!;
  }

  async setSettings(workspaceId: string, value: AttendanceSettings) {
    await this.inTenant(workspaceId, (tx) =>
      tx
        .update(workspaces)
        .set({
          settings: sql`${workspaces.settings} || jsonb_build_object('lateAfterMinutes', ${value.lateAfterMinutes}::int)`,
        })
        .where(eq(workspaces.id, workspaceId)),
    );
    return value;
  }

  /**
   * scheduled -> open, from OPEN_EARLY_MS before its start; an already open session stays as it
   * is. 'too_early' (with the first moment it opens) for a scheduled session further ahead.
   */
  async open(workspaceId: string, id: string, now: Date) {
    return this.inTenant(workspaceId, async (tx) => {
      const where = and(eq(sessions.workspaceId, workspaceId), eq(sessions.id, id));
      const earliest = new Date(now.getTime() + OPEN_EARLY_MS);
      // The start is checked in the update itself, so a move at the same moment can't slip past.
      const [opened] = await tx
        .update(sessions)
        .set({ status: 'open', openedAt: now })
        .where(and(where, eq(sessions.status, 'scheduled'), lte(sessions.startsAt, earliest)))
        .returning({ id: sessions.id });
      if (opened) return { ok: true as const };
      const [row] = await tx
        .select({ status: sessions.status, startsAt: sessions.startsAt })
        .from(sessions)
        .where(where);
      if (row?.status === 'scheduled')
        return { tooEarly: new Date(row.startsAt.getTime() - OPEN_EARLY_MS) };
      return row?.status === 'open' ? { ok: true as const } : {};
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
      // FOR SHARE waits for a concurrent close (which updates this row), so a scan never lands
      // as "absent" from a close that committed in between.
      const [current] = await tx
        .select({ status: sessions.status })
        .from(sessions)
        .where(and(eq(sessions.workspaceId, workspaceId), eq(sessions.id, s.sessionId)))
        .for('share');
      if (current?.status !== 'open') return 'not_open' as const;
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
      return (await this.list(tx, workspaceId, s.sessionId, student.id))[0]!;
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

  /**
   * A manual mark replaces whatever is there (a scan, auto-close or an earlier mark). "Absent"
   * on a closed session that ended in the last 2 days (a late correction) tells that student's
   * guardians, in the same transaction; the close already told the others. Older fixes are
   * record-keeping and text nobody.
   */
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
      if (status === 'absent') {
        const [closed] = await tx
          .select({ id: sessions.id })
          .from(sessions)
          .where(
            and(
              eq(sessions.workspaceId, workspaceId),
              eq(sessions.id, sessionId),
              eq(sessions.status, 'closed'),
              sql`${sessions.endsAt} > ${now.toISOString()}::timestamptz - interval '2 days'`,
            ),
          );
        if (closed) await enqueueAbsences(tx, workspaceId, sessionId, now, studentId);
      }
      return (await this.list(tx, workspaceId, sessionId, studentId))[0]!;
    });
  }

  /**
   * open -> closed, then every active, non-archived enrolled student without a record is absent, and their
   * guardians get an outbox message. One transaction: a crash leaves no half-closed session and no
   * message without its absence.
   */
  close(workspaceId: string, id: string, actorId: string, now: Date) {
    return this.inTenant(workspaceId, async (tx) => {
      const [closed] = await tx
        .update(sessions)
        .set({ status: 'closed', closedBy: actorId })
        .where(
          and(
            eq(sessions.workspaceId, workspaceId),
            eq(sessions.id, id),
            eq(sessions.status, 'open'),
          ),
        )
        .returning({ groupId: sessions.groupId });
      if (!closed) return undefined;
      await tx.execute(sql`
        insert into attendance_records (workspace_id, session_id, student_id, status, method, recorded_at)
        select ${workspaceId}, ${id}, e.student_id, 'absent', 'auto_close', ${now.toISOString()}
        from enrollments e
        join students st on st.workspace_id = e.workspace_id and st.id = e.student_id
        where e.workspace_id = ${workspaceId} and e.group_id = ${closed.groupId}
          and e.status = 'active' and st.status = 'active'
        on conflict do nothing`);
      await enqueueAbsences(tx, workspaceId, id, now);
      return this.list(tx, workspaceId, id);
    });
  }

  /** Active, non-archived students of a group, by name: the same set close marks absent. */
  roster(workspaceId: string, groupId: string): Promise<RosterEntry[]> {
    return this.inTenant(workspaceId, (tx) =>
      tx
        .select({ studentId: students.id, nameAr: students.nameAr, nameEn: students.nameEn })
        .from(enrollments)
        .innerJoin(
          students,
          and(
            eq(students.workspaceId, enrollments.workspaceId),
            eq(students.id, enrollments.studentId),
          ),
        )
        .where(
          and(
            eq(enrollments.workspaceId, workspaceId),
            eq(enrollments.groupId, groupId),
            eq(enrollments.status, 'active'),
            eq(students.status, 'active'),
          ),
        )
        .orderBy(asc(students.nameAr)),
    );
  }

  listForSession(workspaceId: string, sessionId: string) {
    return this.inTenant(workspaceId, (tx) => this.list(tx, workspaceId, sessionId));
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
