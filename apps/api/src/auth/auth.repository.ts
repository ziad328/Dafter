import { Inject, Injectable } from '@nestjs/common';
import { and, eq, gt, isNull, sql } from 'drizzle-orm';
import { type Db, passwordResets, refreshTokens, users } from '@dafter/db';
import { DB } from '../db.js';

export type User = typeof users.$inferSelect;

/** Users and refresh tokens are global (not tenant) tables, so this is a plain repository. */
@Injectable()
export class AuthRepository {
  constructor(@Inject(DB) private readonly db: Db) {}

  async findUserByLogin(login: string): Promise<User | undefined> {
    const where = login.includes('@')
      ? sql`lower(${users.email}) = lower(${login})`
      : eq(users.phone, login);
    const [row] = await this.db.select().from(users).where(where);
    return row;
  }

  async findUserById(id: string): Promise<User | undefined> {
    const [row] = await this.db.select().from(users).where(eq(users.id, id));
    return row;
  }

  async createUser(values: typeof users.$inferInsert): Promise<User> {
    const [row] = await this.db.insert(users).values(values).returning();
    return row!;
  }

  async insertRefresh(values: typeof refreshTokens.$inferInsert) {
    await this.db.insert(refreshTokens).values(values);
  }

  /**
   * Swaps the presented token for a new one in the same family, under a row lock so two
   * concurrent uses cannot both succeed. A revoked token means reuse: the whole family is revoked.
   */
  async rotateRefresh(
    tokenHash: string,
    now: Date,
    next: { tokenHash: string; expiresAt: Date },
  ): Promise<{ userId: string } | 'invalid' | 'reused'> {
    return this.db.transaction(async (tx) => {
      const [row] = await tx
        .select()
        .from(refreshTokens)
        .where(eq(refreshTokens.tokenHash, tokenHash))
        .for('update');
      if (!row) return 'invalid';
      if (row.revokedAt) {
        await revokeFamily(tx, row.familyId, now);
        return 'reused';
      }
      if (row.expiresAt <= now) return 'invalid';
      await tx.update(refreshTokens).set({ revokedAt: now }).where(eq(refreshTokens.id, row.id));
      await tx
        .insert(refreshTokens)
        .values({ userId: row.userId, familyId: row.familyId, ...next });
      return { userId: row.userId };
    });
  }

  async revokeFamilyOf(tokenHash: string, now: Date) {
    const [row] = await this.db
      .select({ familyId: refreshTokens.familyId })
      .from(refreshTokens)
      .where(eq(refreshTokens.tokenHash, tokenHash));
    if (row) await revokeFamily(this.db, row.familyId, now);
  }

  async insertPasswordReset(values: typeof passwordResets.$inferInsert) {
    await this.db.insert(passwordResets).values(values);
  }

  /**
   * Uses a reset token once: under a row lock, marks every open reset of the user used, sets the
   * password and revokes all refresh tokens, so every device is signed out. False if the token is
   * unknown, used or expired.
   */
  async resetPassword(tokenHash: string, passwordHash: string, now: Date): Promise<boolean> {
    return this.db.transaction(async (tx) => {
      const [row] = await tx
        .select({ userId: passwordResets.userId })
        .from(passwordResets)
        .where(
          and(
            eq(passwordResets.tokenHash, tokenHash),
            isNull(passwordResets.usedAt),
            gt(passwordResets.expiresAt, now),
          ),
        )
        .for('update');
      if (!row) return false;
      await tx
        .update(passwordResets)
        .set({ usedAt: now })
        .where(and(eq(passwordResets.userId, row.userId), isNull(passwordResets.usedAt)));
      await tx.update(users).set({ passwordHash }).where(eq(users.id, row.userId));
      await tx
        .update(refreshTokens)
        .set({ revokedAt: now })
        .where(and(eq(refreshTokens.userId, row.userId), isNull(refreshTokens.revokedAt)));
      return true;
    });
  }
}

function revokeFamily(db: Pick<Db, 'update'>, familyId: string, now: Date) {
  return db
    .update(refreshTokens)
    .set({ revokedAt: now })
    .where(and(eq(refreshTokens.familyId, familyId), isNull(refreshTokens.revokedAt)));
}
