import { type CanActivate, type ExecutionContext, Inject, Injectable } from '@nestjs/common';
import * as z from 'zod';
import { WORKSPACE_HEADER, type Workspace } from '@dafter/contracts';
import type { AuthedRequest } from '../auth/auth.guard.js';
import { AppError } from '../errors.js';
import { WorkspacesRepository } from './workspaces.repository.js';

export type TenantedRequest = AuthedRequest & { workspaceId: string; role: Workspace['role'] };

const uuid = z.uuid();

/**
 * Runs after AuthGuard. Reads X-Workspace-Id, checks the user is a member, and puts the
 * workspace id and role on the request. Unknown id and "not a member" are the same 404.
 */
@Injectable()
export class TenantGuard implements CanActivate {
  constructor(@Inject(WorkspacesRepository) private readonly repo: WorkspacesRepository) {}

  async canActivate(ctx: ExecutionContext) {
    const req = ctx.switchToHttp().getRequest<TenantedRequest>();
    const header = req.headers[WORKSPACE_HEADER];
    if (typeof header !== 'string' || !header) throw new AppError('VALIDATION_FAILED');
    if (!uuid.safeParse(header).success) throw new AppError('WORKSPACE_NOT_FOUND');
    const role = await this.repo.findRole(header, req.userId);
    if (!role) throw new AppError('WORKSPACE_NOT_FOUND');
    req.workspaceId = header;
    req.role = role;
    return true;
  }
}
