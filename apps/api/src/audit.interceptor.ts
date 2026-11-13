import {
  type CallHandler,
  type ExecutionContext,
  Inject,
  Injectable,
  type NestInterceptor,
} from '@nestjs/common';
import { PATH_METADATA } from '@nestjs/common/constants';
import { concatMap } from 'rxjs';
import { auditLog, type Db, withTenant } from '@dafter/db';
import { DB } from './db.js';
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
 * that need them. shortcut: the row is written in its own transaction after the handler, so a
 * crash in between loses it; move it into the feature's transaction for the ledger.
 */
@Injectable()
export class AuditInterceptor implements NestInterceptor {
  constructor(@Inject(DB) private readonly db: Db) {}

  intercept(ctx: ExecutionContext, next: CallHandler) {
    const req = ctx.switchToHttp().getRequest<Partial<TenantedRequest> & AuditedRequest>();
    // The route pattern (/invites/:token/accept), never the raw URL with its token.
    const action = `${req.method} ${req.routeOptions?.url ?? ''}`;
    if (READS.has(req.method ?? 'GET') || NOT_AUDITED.has(action)) return next.handle();
    return next.handle().pipe(
      concatMap(async (body: unknown) => {
        const bodyId = (body as { id?: unknown } | undefined)?.id;
        const paramId = (req.params as { id?: string } | undefined)?.id;
        const row = {
          workspaceId: req.audit?.workspaceId ?? req.workspaceId ?? null,
          actorId: req.userId ?? null,
          action,
          entity: (Reflect.getMetadata(PATH_METADATA, ctx.getClass()) as string) ?? '',
          // The path id names the entity (PUT /members/:id/scopes returns no body).
          entityId: req.audit?.entityId ?? paramId ?? (typeof bodyId === 'string' ? bodyId : null),
        };
        if (row.workspaceId)
          await withTenant(this.db, row.workspaceId, (tx) => tx.insert(auditLog).values(row));
        else await this.db.insert(auditLog).values(row);
        return body;
      }),
    );
  }
}
