import { Inject, Injectable } from '@nestjs/common';
import type { CreateGroupRequest, Group, UpdateGroupRequest } from '@dafter/contracts';
import { gradeLevels, subjects } from '@dafter/db';
import { Clock } from '../clock.js';
import { AppError } from '../errors.js';
import type { TenantedRequest } from '../workspaces/tenant.guard.js';
import { type GroupValues, GroupsRepository } from './groups.repository.js';

type Ctx = Pick<TenantedRequest, 'workspaceId' | 'role' | 'membershipId'>;

/**
 * Policy. Owner: every group. Teacher: own groups only. Assistant: reads the groups of the
 * teachers they are assigned to, never writes. A group outside the caller's view is a 404.
 */
@Injectable()
export class GroupsService {
  constructor(
    @Inject(GroupsRepository) private readonly repo: GroupsRepository,
    @Inject(Clock) private readonly clock: Clock,
  ) {}

  subjects(ctx: Ctx) {
    return this.repo.curriculum(ctx.workspaceId, subjects);
  }

  gradeLevels(ctx: Ctx) {
    return this.repo.curriculum(ctx.workspaceId, gradeLevels);
  }

  async list(ctx: Ctx): Promise<Group[]> {
    return this.repo.list(ctx.workspaceId, await this.visibleTeachers(ctx));
  }

  async get(ctx: Ctx, id: string): Promise<Group> {
    const group = await this.repo.find(ctx.workspaceId, id);
    const teachers = await this.visibleTeachers(ctx);
    if (!group || (teachers && !teachers.includes(group.teacherMembershipId)))
      throw new AppError('GROUP_NOT_FOUND');
    return group;
  }

  async create(ctx: Ctx, body: CreateGroupRequest): Promise<Group> {
    if (ctx.role === 'assistant') throw new AppError('FORBIDDEN');
    const teacherMembershipId = body.teacherMembershipId ?? ctx.membershipId;
    if (ctx.role === 'teacher' && teacherMembershipId !== ctx.membershipId)
      throw new AppError('FORBIDDEN');
    const values: GroupValues = {
      teacherMembershipId,
      subjectId: body.subjectId,
      gradeLevelId: body.gradeLevelId,
      label: body.label ?? null,
      capacity: body.capacity ?? null,
      monthlyFeePiastres: body.monthlyFeePiastres ?? null,
      roomId: body.roomId ?? null,
    };
    await this.checkReferences(ctx, values);
    const id = await this.repo.create(ctx.workspaceId, values, body.slots, this.clock.now());
    return this.get(ctx, id);
  }

  async update(ctx: Ctx, id: string, body: UpdateGroupRequest): Promise<Group> {
    const group = await this.get(ctx, id);
    const mine = group.teacherMembershipId === ctx.membershipId;
    if (ctx.role === 'assistant' || (ctx.role === 'teacher' && !mine))
      throw new AppError('FORBIDDEN');
    const { slots, ...patch } = body;
    if (
      patch.teacherMembershipId &&
      patch.teacherMembershipId !== group.teacherMembershipId &&
      ctx.role !== 'owner'
    )
      throw new AppError('FORBIDDEN');
    // An archived room may stay on its group; only a newly picked room must be active.
    await this.checkReferences(ctx, {
      ...patch,
      roomId: patch.roomId === group.room?.id ? undefined : patch.roomId,
    });
    await this.repo.update(ctx.workspaceId, id, patch, slots, this.clock.now());
    return this.get(ctx, id);
  }

  /** undefined = every teacher (owner). Sessions use the same view. */
  async visibleTeachers(ctx: Ctx): Promise<string[] | undefined> {
    if (ctx.role === 'owner') return undefined;
    if (ctx.role === 'teacher') return [ctx.membershipId];
    return this.repo.scopedTeachers(ctx.workspaceId, ctx.membershipId);
  }

  private async checkReferences(ctx: Ctx, values: Partial<GroupValues>) {
    const found = await this.repo.references(ctx.workspaceId, values);
    const invalid = (field: string) => new AppError('GROUP_REFERENCE_INVALID', { field });
    // Owners teach too (an independent teacher owns their workspace); assistants do not.
    if (values.teacherMembershipId && (!found.teacherRole || found.teacherRole === 'assistant'))
      throw invalid('teacherMembershipId');
    if (values.subjectId && !found.subject) throw invalid('subjectId');
    if (values.gradeLevelId && !found.gradeLevel) throw invalid('gradeLevelId');
    if (values.roomId && !found.room) throw invalid('roomId');
  }
}
