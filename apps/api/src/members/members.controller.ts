import {
  Body,
  Controller,
  Get,
  HttpCode,
  Inject,
  Param,
  Patch,
  Post,
  Put,
  Req,
  UseGuards,
} from '@nestjs/common';
import * as z from 'zod';
import {
  type CreateInviteRequest,
  createInviteRequest,
  type Invite,
  type Member,
  type SetScopesRequest,
  setScopesRequest,
  type StaffResetLink,
  type UpdateMemberRequest,
  updateMemberRequest,
  type Workspace,
} from '@dafter/contracts';
import type { AuditedRequest } from '../audit.interceptor.js';
import { AuthGuard, type AuthedRequest } from '../auth/auth.guard.js';
import { TenantGuard, type TenantedRequest } from '../workspaces/tenant.guard.js';
import { ZodPipe } from '../zod-pipe.js';
import { MembersService } from './members.service.js';

@Controller('invites')
@UseGuards(AuthGuard)
export class InvitesController {
  constructor(@Inject(MembersService) private readonly members: MembersService) {}

  @Post()
  @UseGuards(TenantGuard)
  create(
    @Req() req: TenantedRequest,
    @Body(new ZodPipe(createInviteRequest)) body: CreateInviteRequest,
  ): Promise<Invite> {
    return this.members.createInvite(req.workspaceId, req.role, body);
  }

  // No TenantGuard: the invitee is not a member yet; the token names the workspace.
  @Post(':token/accept')
  @HttpCode(200)
  async accept(
    @Req() req: AuthedRequest & AuditedRequest,
    @Param('token') token: string,
  ): Promise<Workspace> {
    const { workspace, inviteId } = await this.members.accept(req.userId, token);
    req.audit = { workspaceId: workspace.id, entityId: inviteId };
    return workspace;
  }
}

@Controller('members')
@UseGuards(AuthGuard, TenantGuard)
export class MembersController {
  constructor(@Inject(MembersService) private readonly members: MembersService) {}

  @Get()
  list(@Req() req: TenantedRequest): Promise<Member[]> {
    return this.members.list(req.workspaceId);
  }

  @Patch(':id')
  update(
    @Req() req: TenantedRequest,
    @Param('id', new ZodPipe(z.uuid())) id: string,
    @Body(new ZodPipe(updateMemberRequest)) body: UpdateMemberRequest,
  ): Promise<Member> {
    return this.members.update(req.workspaceId, req.role, id, body);
  }

  @Post(':id/password-reset')
  resetLink(
    @Req() req: TenantedRequest,
    @Param('id', new ZodPipe(z.uuid())) id: string,
  ): Promise<StaffResetLink> {
    return this.members.resetLink(req.workspaceId, req.role, id);
  }

  @Put(':id/scopes')
  @HttpCode(204)
  setScopes(
    @Req() req: TenantedRequest,
    @Param('id', new ZodPipe(z.uuid())) id: string,
    @Body(new ZodPipe(setScopesRequest)) body: SetScopesRequest,
  ): Promise<void> {
    return this.members.setScopes(req.workspaceId, req.role, id, body.teacherMembershipIds);
  }
}
