import { Inject } from '@nestjs/common';
import { type Db, type Tx, withTenant } from '@dafter/db';
import { DB } from './db.js';

/**
 * Base for every repository that touches tenant tables. The workspace id comes from
 * `req.workspaceId` (set by TenantGuard after checking membership), and every query runs
 * inside `inTenant`, so RLS backs up the repository's own `workspace_id` filters.
 */
export abstract class TenantRepository {
  constructor(@Inject(DB) protected readonly db: Db) {}

  protected inTenant<T>(workspaceId: string, fn: (tx: Tx) => Promise<T>) {
    return withTenant(this.db, workspaceId, fn);
  }
}
