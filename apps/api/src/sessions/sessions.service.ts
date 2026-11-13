import { Inject, Injectable } from '@nestjs/common';
import type { ListSessionsQuery, MoveSessionRequest, Session } from '@dafter/contracts';
import { Clock } from '../clock.js';
import { AppError } from '../errors.js';
import { GroupsService } from '../groups/groups.service.js';
import type { TenantedRequest } from '../workspaces/tenant.guard.js';
import { SessionsRepository } from './sessions.repository.js';

type Ctx = Pick<TenantedRequest, 'workspaceId' | 'role' | 'membershipId'>;

/**
 * Same view as groups: owner all, teacher own, assistant reads assigned teachers'.
 * Writes: the owner or the group's teacher. A session outside the view is a 404.
 */
@Injectable()
export class SessionsService {
  constructor(
    @Inject(SessionsRepository) private readonly repo: SessionsRepository,
    @Inject(GroupsService) private readonly groups: GroupsService,
    @Inject(Clock) private readonly clock: Clock,
  ) {}

  async list(ctx: Ctx, q: ListSessionsQuery): Promise<Session[]> {
    return this.repo.list(ctx.workspaceId, q.from, q.to, await this.groups.visibleTeachers(ctx));
  }

  async cancel(ctx: Ctx, id: string): Promise<Session> {
    await this.writable(ctx, id);
    if (!(await this.repo.cancel(ctx.workspaceId, id))) throw new AppError('SESSION_NOT_SCHEDULED');
    return this.get(ctx, id);
  }

  async move(ctx: Ctx, id: string, to: MoveSessionRequest): Promise<Session> {
    await this.writable(ctx, id);
    // A status change between the check and the update also lands here; rare enough for v0.
    if (!(await this.repo.move(ctx.workspaceId, id, to, this.clock.now())))
      throw new AppError('SESSION_TIME_INVALID');
    return this.get(ctx, id);
  }

  private async get(ctx: Ctx, id: string) {
    const session = await this.repo.find(ctx.workspaceId, id);
    const teachers = await this.groups.visibleTeachers(ctx);
    if (!session || (teachers && !teachers.includes(session.teacherMembershipId)))
      throw new AppError('SESSION_NOT_FOUND');
    return session;
  }

  private async writable(ctx: Ctx, id: string) {
    const session = await this.get(ctx, id);
    // A teacher only sees their own groups' sessions, so only the assistant is refused here.
    if (ctx.role === 'assistant') throw new AppError('FORBIDDEN');
    if (session.status !== 'scheduled') throw new AppError('SESSION_NOT_SCHEDULED');
  }
}
