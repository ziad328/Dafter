import { sql } from 'drizzle-orm';
import type { Db } from './client.js';

export type Tx = Parameters<Parameters<Db['transaction']>[0]>[0];

/**
 * The only way to touch tenant tables. Runs `fn` in a transaction as the RLS-bound role
 * `dafter_app` with `app.workspace_id` set; both are LOCAL, so they reset when the
 * transaction ends and never leak to the next user of the pooled connection.
 */
export function withTenant<T>(db: Db, workspaceId: string, fn: (tx: Tx) => Promise<T>) {
  return db.transaction(async (tx) => {
    await tx.execute(sql`set local role dafter_app`);
    await tx.execute(sql`select set_config('app.workspace_id', ${workspaceId}, true)`);
    return fn(tx);
  });
}
