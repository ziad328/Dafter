import { Body, Controller, Get, Inject, Param, Patch, Post, Req, UseGuards } from '@nestjs/common';
import * as z from 'zod';
import {
  type CreateGroupRequest,
  createGroupRequest,
  type CurriculumItem,
  type Group,
  type UpdateGroupRequest,
  updateGroupRequest,
} from '@dafter/contracts';
import type { AuditedRequest } from '../audit.interceptor.js';
import { AuthGuard } from '../auth/auth.guard.js';
import { TenantGuard, type TenantedRequest } from '../workspaces/tenant.guard.js';
import { ZodPipe } from '../zod-pipe.js';
import { GroupsService } from './groups.service.js';

@Controller()
@UseGuards(AuthGuard, TenantGuard)
export class CurriculumController {
  constructor(@Inject(GroupsService) private readonly groups: GroupsService) {}

  @Get('subjects')
  subjects(@Req() req: TenantedRequest): Promise<CurriculumItem[]> {
    return this.groups.subjects(req);
  }

  @Get('grade-levels')
  gradeLevels(@Req() req: TenantedRequest): Promise<CurriculumItem[]> {
    return this.groups.gradeLevels(req);
  }
}

@Controller('groups')
@UseGuards(AuthGuard, TenantGuard)
export class GroupsController {
  constructor(@Inject(GroupsService) private readonly groups: GroupsService) {}

  @Get()
  list(@Req() req: TenantedRequest): Promise<Group[]> {
    return this.groups.list(req);
  }

  @Post()
  async create(
    @Req() req: TenantedRequest & AuditedRequest,
    @Body(new ZodPipe(createGroupRequest)) body: CreateGroupRequest,
  ): Promise<Group> {
    const group = await this.groups.create(req, body);
    req.audit = { entityId: group.id };
    return group;
  }

  @Get(':id')
  get(@Req() req: TenantedRequest, @Param('id', new ZodPipe(z.uuid())) id: string): Promise<Group> {
    return this.groups.get(req, id);
  }

  @Patch(':id')
  update(
    @Req() req: TenantedRequest,
    @Param('id', new ZodPipe(z.uuid())) id: string,
    @Body(new ZodPipe(updateGroupRequest)) body: UpdateGroupRequest,
  ): Promise<Group> {
    return this.groups.update(req, id, body);
  }
}
