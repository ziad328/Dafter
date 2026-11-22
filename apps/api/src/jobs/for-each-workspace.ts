import { Logger } from '@nestjs/common';
import { asc, gt } from 'drizzle-orm';
import { type Db, type Tx, withTenant, workspaces } from '@dafter/db';

const BATCH = 100;

/**
 * Runs `job` for every workspace, each in its own RLS-bound transaction, and adds up what it
 * returns. Workspace ids are read `batch` at a time by keyset (never all at once), and a workspace
 * whose job throws is logged and skipped (its transaction rolls back) so the others still run.
 */
export async function forEachWorkspace(
  db: Db,
  name: string,
  job: (tx: Tx, workspaceId: string) => Promise<number>,
  { batch = BATCH, log = new Logger(name) }: { batch?: number; log?: Pick<Logger, 'error'> } = {},
) {
  let total = 0;
  let after: string | undefined;
  for (;;) {
    const page = await db
      .select({ id: workspaces.id })
      .from(workspaces)
      .where(after ? gt(workspaces.id, after) : undefined)
      .orderBy(asc(workspaces.id))
      .limit(batch);
    for (const { id } of page) {
      try {
        total += await withTenant(db, id, (tx) => job(tx, id));
      } catch (err) {
        log.error(`${name} failed for workspace ${id}: ${String(err)}`);
      }
    }
    if (page.length < batch) return total;
    after = page.at(-1)!.id;
  }
}
