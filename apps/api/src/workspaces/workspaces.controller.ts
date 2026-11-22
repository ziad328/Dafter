import { Body, Controller, Get, Inject, Post, Req, UseGuards } from '@nestjs/common';
import {
  type CreateWorkspaceRequest,
  createWorkspaceRequest,
  type Workspace,
} from '@dafter/contracts';
import { AuthGuard, type AuthedRequest } from '../auth/auth.guard.js';
import { ZodPipe } from '../zod-pipe.js';
import { TenantGuard, type TenantedRequest } from './tenant.guard.js';
import { WorkspacesService } from './workspaces.service.js';

@Controller('workspaces')
@UseGuards(AuthGuard)
export class WorkspacesController {
  constructor(@Inject(WorkspacesService) private readonly workspaces: WorkspacesService) {}

  @Post()
  create(
    @Req() req: AuthedRequest,
    @Body(new ZodPipe(createWorkspaceRequest)) body: CreateWorkspaceRequest,
  ): Promise<Workspace> {
    // Its audit row is written in the create's transaction (recordAudit).
    return this.workspaces.create(req.userId, body);
  }

  @Get()
  list(@Req() req: AuthedRequest): Promise<Workspace[]> {
    return this.workspaces.list(req.userId);
  }

  @Get('current')
  @UseGuards(TenantGuard)
  current(@Req() req: TenantedRequest): Promise<Workspace> {
    return this.workspaces.current(req.workspaceId, req.role);
  }
}
