import {
  type CallHandler,
  type ExecutionContext,
  Inject,
  Injectable,
  type NestInterceptor,
} from '@nestjs/common';
import { PATH_METADATA } from '@nestjs/common/constants';
import { concatMap, defer, lastValueFrom } from 'rxjs';
import { auditLog, type Db, withTenant } from '@dafter/db';
import { DB } from './db.js';
import { type RequestTx, requestTx } from './request-tx.js';
import type { TenantedRequest } from './workspaces/tenant.guard.js';

const READS = new Set(['GET', 'HEAD', 'OPTIONS']);
// Token rotation every ~15 minutes per tab would bury the real writes.
const NOT_AUDITED = new Set(['POST /api/v1/auth/refresh']);

/**
 * A handler sets `req.audit` when the defaults are wrong: a route that creates or joins a
 * workspace outside TenantGuard, or one whose response id is not the entity's id.
 */
export type AuditedRequest = { audit?: { workspaceId?: string; entityId?: string } };

/**
 * Writes one audit_log row per successful write request: who, where, which route, which id.
 * Bodies are not stored (an invite response holds its token); before/after come with features
 * that need them. A tenant write (TenantGuard set the workspace) runs in one transaction that
 * the repositories join (`requestTx`), and the audit row is written in it last: the write and
 * its record commit together or not at all. Routes outside a workspace (sign-in, invite accept,
 * check-in) still write the row in its own transaction after the handler.
 */
@Injectable()
export class AuditInterceptor implements NestInterceptor {
  constructor(@Inject(DB) private readonly db: Db) {}

  intercept(ctx: ExecutionContext, next: CallHandler) {
    const req = ctx.switchToHttp().getRequest<Partial<TenantedRequest> & AuditedRequest>();
    // The route pattern (/invites/:token/accept), never the raw URL with its token.
    const action = `${req.method} ${req.routeOptions?.url ?? ''}`;
    if (READS.has(req.method ?? 'GET') || NOT_AUDITED.has(action)) return next.handle();
    const row = (body: unknown) => {
      const bodyId = (body as { id?: unknown } | undefined)?.id;
      const paramId = (req.params as { id?: string } | undefined)?.id;
      return {
        workspaceId: req.audit?.workspaceId ?? req.workspaceId ?? null,
        actorId: req.userId ?? null,
        action,
        entity: (Reflect.getMetadata(PATH_METADATA, ctx.getClass()) as string) ?? '',
        // The path id names the entity (PUT /members/:id/scopes returns no body).
        entityId: req.audit?.entityId ?? paramId ?? (typeof bodyId === 'string' ? bodyId : null),
      };
    };
    const workspaceId = req.workspaceId;
    if (workspaceId) return defer(() => this.inRequestTx(workspaceId, next, row));
    return next.handle().pipe(
      concatMap(async (body: unknown) => {
        const entry = row(body);
        if (entry.workspaceId)
          await withTenant(this.db, entry.workspaceId, (tx) => tx.insert(auditLog).values(entry));
        else await this.db.insert(auditLog).values(entry);
        return body;
      }),
    );
  }

  /** The handler and its audit row in one transaction; after-commit work runs once it commits. */
  private async inRequestTx(
    workspaceId: string,
    // handle() is called inside the store: Nest binds the handler to the async context there.
    next: CallHandler,
    row: (body: unknown) => typeof auditLog.$inferInsert,
  ) {
    let after: RequestTx['after'] = [];
    const body = await withTenant(this.db, workspaceId, (tx) => {
      const store: RequestTx = { workspaceId, tx, after: [] };
      after = store.after;
      return requestTx.run(store, async () => {
        const result = await lastValueFrom(next.handle(), { defaultValue: undefined });
        await tx.insert(auditLog).values(row(result));
        return result;
      });
    });
    for (const task of after) await task();
    return body;
  }
}
