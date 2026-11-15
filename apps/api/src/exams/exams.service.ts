import { Inject, Injectable } from '@nestjs/common';
import type {
  CreateExamRequest,
  Exam,
  ExamSheet,
  SaveExamResultsRequest,
  UpdateExamRequest,
} from '@dafter/contracts';
import { Clock } from '../clock.js';
import { AppError } from '../errors.js';
import { GroupsService } from '../groups/groups.service.js';
import { OutboxSender } from '../messages/outbox-sender.js';
import type { TenantedRequest } from '../workspaces/tenant.guard.js';
import { ExamsRepository } from './exams.repository.js';

type Ctx = Pick<TenantedRequest, 'workspaceId' | 'role' | 'membershipId' | 'userId'>;

/**
 * Policy: whoever sees the group (owner all, teacher own, assistant their teachers') creates,
 * grades and sends its exams. An exam outside the caller's view is a 404.
 */
@Injectable()
export class ExamsService {
  constructor(
    @Inject(ExamsRepository) private readonly repo: ExamsRepository,
    @Inject(GroupsService) private readonly groups: GroupsService,
    @Inject(OutboxSender) private readonly outbox: OutboxSender,
    @Inject(Clock) private readonly clock: Clock,
  ) {}

  async list(ctx: Ctx, groupId: string): Promise<Exam[]> {
    await this.groups.get(ctx, groupId);
    return this.repo.list(ctx.workspaceId, groupId);
  }

  async create(ctx: Ctx, groupId: string, body: CreateExamRequest): Promise<Exam> {
    await this.groups.get(ctx, groupId);
    return this.repo.create(ctx.workspaceId, groupId, body, ctx.userId);
  }

  async sheet(ctx: Ctx, id: string): Promise<ExamSheet> {
    await this.visible(ctx, id);
    return this.repo.sheet(ctx.workspaceId, id);
  }

  async update(ctx: Ctx, id: string, body: UpdateExamRequest): Promise<Exam> {
    await this.visible(ctx, id);
    return this.repo.update(ctx.workspaceId, id, body);
  }

  async remove(ctx: Ctx, id: string) {
    await this.visible(ctx, id);
    await this.repo.remove(ctx.workspaceId, id);
  }

  async save(ctx: Ctx, id: string, body: SaveExamResultsRequest): Promise<ExamSheet> {
    await this.visible(ctx, id);
    return this.repo.save(ctx.workspaceId, id, body, ctx.userId, this.clock.now());
  }

  async notify(ctx: Ctx, id: string) {
    await this.visible(ctx, id);
    const queued = await this.repo.notify(ctx.workspaceId, id, this.clock.now());
    await this.outbox.afterCommit(ctx.workspaceId);
    return { queued };
  }

  private async visible(ctx: Ctx, id: string) {
    const teacher = await this.repo.owner(ctx.workspaceId, id);
    const teachers = await this.groups.visibleTeachers(ctx);
    if (!teacher || (teachers && !teachers.includes(teacher))) throw new AppError('EXAM_NOT_FOUND');
  }
}
