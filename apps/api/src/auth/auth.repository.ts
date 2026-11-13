import { Inject, Injectable } from '@nestjs/common';
import { and, eq, isNull, sql } from 'drizzle-orm';
import { type Db, refreshTokens, users } from '@dafter/db';
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
}

function revokeFamily(db: Pick<Db, 'update'>, familyId: string, now: Date) {
  return db
    .update(refreshTokens)
    .set({ revokedAt: now })
    .where(and(eq(refreshTokens.familyId, familyId), isNull(refreshTokens.revokedAt)));
}
