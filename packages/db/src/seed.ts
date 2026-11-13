import { createDb } from './client.js';
import { assistantScopes, memberships, users, workspaces } from './schema.js';

// Demo center for local work and the live demo. Run on an empty database (pnpm db:reset).
// Staff get passwords on Day 4, when argon2 hashing exists.
export async function seed(connectionString: string) {
  const { db, pool } = createDb(connectionString);
  try {
    await db.transaction(async (tx) => {
      const [center] = await tx
        .insert(workspaces)
        .values({ type: 'center', nameAr: 'سنتر النور', nameEn: 'Al-Nour Center' })
        .returning();

      const [owner, teacher, assistant] = await tx
        .insert(users)
        .values([
          { name: 'أحمد محمود', phone: '01000000001', email: 'owner@dafter.test' },
          { name: 'منى حسن', phone: '01000000002', email: 'teacher@dafter.test' },
          { name: 'يوسف علي', phone: '01000000003', email: 'assistant@dafter.test' },
        ])
        .returning();

      const [, teacherM, assistantM] = await tx
        .insert(memberships)
        .values([
          { workspaceId: center!.id, userId: owner!.id, role: 'owner' },
          { workspaceId: center!.id, userId: teacher!.id, role: 'teacher' },
          { workspaceId: center!.id, userId: assistant!.id, role: 'assistant' },
        ])
        .returning();

      await tx.insert(assistantScopes).values({
        workspaceId: center!.id,
        membershipId: assistantM!.id,
        teacherMembershipId: teacherM!.id,
      });
    });
  } finally {
    await pool.end();
  }
}
