import { type Db, withTenant, workspaces } from '@dafter/db';
import type { Clock } from '../clock.js';
import { generateSessions } from '../sessions/generate.js';

export const GENERATE_SESSIONS = 'generate-sessions';

/** Tops every workspace up to 4 weeks of sessions; one RLS-bound transaction per workspace. */
export async function generateAllSessions(db: Db, clock: Clock) {
  // shortcut: one pass over every workspace; batch or fan out per workspace when there are thousands.
  const rows = await db.select({ id: workspaces.id }).from(workspaces);
  let created = 0;
  for (const { id } of rows)
    created += await withTenant(db, id, (tx) => generateSessions(tx, id, clock.now()));
  return created;
}
