import { Inject } from '@nestjs/common';
import { type Db, type Tx, withTenant } from '@dafter/db';
import { DB } from './db.js';
import { requestTx } from './request-tx.js';

/**
 * Base for every repository that touches tenant tables. The workspace id comes from
 * `req.workspaceId` (set by TenantGuard after checking membership), and every query runs
 * inside `inTenant`, so RLS backs up the repository's own `workspace_id` filters. Inside a tenant
 * write request, `inTenant` joins the request's transaction as a savepoint: a block that throws
 * rolls back only its own work (as its own transaction did), and everything commits together
 * with the audit row.
 */
export abstract class TenantRepository {
  constructor(@Inject(DB) protected readonly db: Db) {}

  protected inTenant<T>(workspaceId: string, fn: (tx: Tx) => Promise<T>) {
    const current = requestTx.getStore();
    if (current?.workspaceId === workspaceId) return current.tx.transaction(fn);
    return withTenant(this.db, workspaceId, fn);
  }
}
