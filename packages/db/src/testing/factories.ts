import type { Db } from '../client.js';
import { memberships, users, workspaces } from '../schema.js';

let seq = 0;
const next = () => ++seq;

export async function makeUser(db: Db, values: Partial<typeof users.$inferInsert> = {}) {
  const n = next();
  const [row] = await db
    .insert(users)
    .values({ name: `مستخدم ${n}`, phone: `01${String(n).padStart(9, '0')}`, ...values })
    .returning();
  return row!;
}

export async function makeWorkspace(db: Db, values: Partial<typeof workspaces.$inferInsert> = {}) {
  const [row] = await db
    .insert(workspaces)
    .values({ type: 'center', nameAr: `سنتر ${next()}`, ...values })
    .returning();
  return row!;
}

export async function makeMembership(
  db: Db,
  values: Pick<typeof memberships.$inferInsert, 'workspaceId' | 'userId'> &
    Partial<typeof memberships.$inferInsert>,
) {
  const [row] = await db
    .insert(memberships)
    .values({ role: 'teacher', ...values })
    .returning();
  return row!;
}
