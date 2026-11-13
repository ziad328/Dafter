import { createDb } from './client.js';
import { assistantScopes, memberships, users, workspaces } from './schema.js';

// Demo center for local work and the live demo. Run on an empty database (pnpm db:reset).
// Every demo staff user signs in with the dev password `dafter-dev-123` (argon2id hash below).
const DEV_PASSWORD_HASH =
  '$argon2id$v=19$m=19456,t=2,p=1$LR+GnavtUhYVGmjbH/WSCA$w0qdiyn48mchv6fTtoMKPyZ3UyYlAd6A3kEWu6f/fyU';
export async function seed(connectionString: string) {
  const { db, pool } = createDb(connectionString);
  try {
    await db.transaction(async (tx) => {
      const [center, privateLessons] = await tx
        .insert(workspaces)
        .values([
          { type: 'center', nameAr: 'سنتر النور', nameEn: 'Al-Nour Center' },
          // The teacher also tutors on her own, so she has a second workspace to switch to.
          { type: 'independent', nameAr: 'دروس منى حسن', nameEn: 'Mona Hassan Lessons' },
        ])
        .returning();

      const [owner, teacher, assistant] = await tx
        .insert(users)
        .values([
          {
            name: 'أحمد محمود',
            phone: '01000000001',
            email: 'owner@dafter.test',
            passwordHash: DEV_PASSWORD_HASH,
          },
          {
            name: 'منى حسن',
            phone: '01000000002',
            email: 'teacher@dafter.test',
            passwordHash: DEV_PASSWORD_HASH,
          },
          {
            name: 'يوسف علي',
            phone: '01000000003',
            email: 'assistant@dafter.test',
            passwordHash: DEV_PASSWORD_HASH,
          },
        ])
        .returning();

      const [, teacherM, assistantM] = await tx
        .insert(memberships)
        .values([
          { workspaceId: center!.id, userId: owner!.id, role: 'owner' },
          { workspaceId: center!.id, userId: teacher!.id, role: 'teacher' },
          { workspaceId: center!.id, userId: assistant!.id, role: 'assistant' },
          { workspaceId: privateLessons!.id, userId: teacher!.id, role: 'owner' },
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
