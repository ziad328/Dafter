import { Inject, Injectable } from '@nestjs/common';
import { and, desc, eq, gt, isNull, sql } from 'drizzle-orm';
import {
  type Db,
  otpCodes,
  studentDevices,
  studentInvites,
  students,
  type Tx,
  users,
  withTenant,
} from '@dafter/db';
import { DB } from '../db.js';

export type User = typeof users.$inferSelect;
export const OTP_MAX_ATTEMPTS = 5;

/**
 * Identity tables (otp_codes, student_devices, users) are global. The two lookups that cross
 * workspaces (an invite by its token hash, "is this user a student anywhere") read as the table
 * owner, like the staff invite lookup; writes to tenant rows go through withTenant.
 */
@Injectable()
export class StudentAuthRepository {
  constructor(@Inject(DB) private readonly db: Db) {}

  /** A usable invite (unused, unexpired, student not yet activated). */
  async findInvite(tokenHash: string, now: Date) {
    const [row] = await this.db
      .select({
        workspaceId: studentInvites.workspaceId,
        studentId: studentInvites.studentId,
        nameAr: students.nameAr,
      })
      .from(studentInvites)
      .innerJoin(
        students,
        and(
          eq(students.workspaceId, studentInvites.workspaceId),
          eq(students.id, studentInvites.studentId),
        ),
      )
      .where(
        and(
          eq(studentInvites.tokenHash, tokenHash),
          isNull(studentInvites.usedAt),
          gt(studentInvites.expiresAt, now),
          isNull(students.userId),
        ),
      );
    return row;
  }

  async findUserByEmail(email: string): Promise<User | undefined> {
    const [row] = await this.db
      .select()
      .from(users)
      .where(sql`lower(${users.email}) = ${email}`);
    return row;
  }

  async isStudent(userId: string) {
    const rows = await this.db
      .select({ id: students.id })
      .from(students)
      .where(eq(students.userId, userId))
      .limit(1);
    return rows.length > 0;
  }

  /** A new code replaces any unused one for the same email. */
  async replaceOtp(destination: string, codeHash: string, now: Date, expiresAt: Date) {
    await this.db.transaction(async (tx) => {
      await tx
        .update(otpCodes)
        .set({ consumedAt: now })
        .where(and(eq(otpCodes.destination, destination), isNull(otpCodes.consumedAt)));
      await tx.insert(otpCodes).values({ destination, codeHash, expiresAt });
    });
  }

  /**
   * Runs `fn` in one transaction: inside the invite's workspace when there is one (activation
   * writes tenant rows), else a plain one. Either way it can touch the identity tables.
   */
  transaction<T>(workspaceId: string | undefined, fn: (tx: Tx) => Promise<T>) {
    return workspaceId ? withTenant(this.db, workspaceId, fn) : this.db.transaction(fn);
  }

  /**
   * Checks the newest unused code under a row lock, so two parallel guesses cannot both count
   * as one attempt. A wrong guess is counted; the fifth burns the code.
   */
  async checkOtp(tx: Tx, destination: string, matches: (hash: string) => boolean, now: Date) {
    const [row] = await tx
      .select()
      .from(otpCodes)
      .where(and(eq(otpCodes.destination, destination), isNull(otpCodes.consumedAt)))
      .orderBy(desc(otpCodes.createdAt))
      .limit(1)
      .for('update');
    if (!row || row.expiresAt <= now) return false;
    const ok = matches(row.codeHash);
    const attempts = row.attempts + (ok ? 0 : 1);
    await tx
      .update(otpCodes)
      .set({ attempts, consumedAt: ok || attempts >= OTP_MAX_ATTEMPTS ? now : null })
      .where(eq(otpCodes.id, row.id));
    return ok;
  }

  async findOrCreateStudentUser(tx: Tx, email: string, name: string): Promise<User> {
    const [found] = await tx
      .select()
      .from(users)
      .where(sql`lower(${users.email}) = ${email}`);
    if (found) return found;
    // A parallel activation with the same email may insert first; then read its row.
    const [created] = await tx
      .insert(users)
      .values({ name, email })
      .onConflictDoNothing()
      .returning();
    if (created) return created;
    const [raced] = await tx
      .select()
      .from(users)
      .where(sql`lower(${users.email}) = ${email}`);
    return raced!;
  }

  /** Uses the invite and links the student record to the login, both only if still unused. */
  async activate(tx: Tx, workspaceId: string, tokenHash: string, userId: string, now: Date) {
    const [invite] = await tx
      .update(studentInvites)
      .set({ usedAt: now })
      .where(
        and(
          eq(studentInvites.tokenHash, tokenHash),
          isNull(studentInvites.usedAt),
          gt(studentInvites.expiresAt, now),
        ),
      )
      .returning({ studentId: studentInvites.studentId });
    if (!invite) return false;
    const linked = await tx
      .update(students)
      .set({ userId })
      .where(
        and(
          eq(students.workspaceId, workspaceId),
          eq(students.id, invite.studentId),
          isNull(students.userId),
        ),
      )
      .returning({ id: students.id });
    return linked.length > 0;
  }

  /** Idempotent for the same key: the phone may call it on every visit. */
  async bindDevice(userId: string, publicKey: string, label: string | undefined) {
    const [active] = await this.db
      .select({ id: studentDevices.id, boundAt: studentDevices.boundAt })
      .from(studentDevices)
      .where(
        and(
          eq(studentDevices.userId, userId),
          eq(studentDevices.publicKey, publicKey),
          isNull(studentDevices.revokedAt),
        ),
      );
    if (active) return active;
    const [row] = await this.db
      .insert(studentDevices)
      .values({ userId, publicKey, label })
      .returning({ id: studentDevices.id, boundAt: studentDevices.boundAt });
    return row!;
  }
}
