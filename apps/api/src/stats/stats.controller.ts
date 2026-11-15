import { Controller, Get, Inject, Module, Query, Req, UseGuards } from '@nestjs/common';
import {
  cashSummaryQuery,
  type CashSummary,
  type CashSummaryQuery,
  type CollectionStats,
  type OwingStudent,
  type TodayStats,
  type TrendStats,
} from '@dafter/contracts';
import { AuthGuard } from '../auth/auth.guard.js';
import { AuthModule } from '../auth/auth.module.js';
import { Clock } from '../clock.js';
import { AppError } from '../errors.js';
import { GroupsModule } from '../groups/groups.module.js';
import { GroupsService } from '../groups/groups.service.js';
import { TenantGuard, type TenantedRequest } from '../workspaces/tenant.guard.js';
import { WorkspacesModule } from '../workspaces/workspaces.module.js';
import { ZodPipe } from '../zod-pipe.js';
import { StatsRepository } from './stats.repository.js';

@Controller('stats')
@UseGuards(AuthGuard, TenantGuard)
export class StatsController {
  constructor(
    @Inject(StatsRepository) private readonly repo: StatsRepository,
    @Inject(GroupsService) private readonly groups: GroupsService,
    @Inject(Clock) private readonly clock: Clock,
  ) {}

  /** Same group visibility as the timetable: owner all, teacher own, assistant assigned. */
  @Get('today')
  async today(@Req() req: TenantedRequest): Promise<TodayStats> {
    const teachers = await this.groups.visibleTeachers(req);
    return this.repo.today(req.workspaceId, this.clock.now(), teachers);
  }

  /** Visible groups like `today`; the money part follows the money policy (null for teachers). */
  @Get('trends')
  async trends(@Req() req: TenantedRequest): Promise<TrendStats> {
    const teachers = await this.groups.visibleTeachers(req);
    return this.repo.trends(req.workspaceId, this.clock.now(), teachers, req.role !== 'teacher');
  }

  /** Policy: the center's money is for the owner and assistants (who take payments), not teachers. */
  /** Same money policy as collections; assistants see only their teachers' groups. */
  @Get('owing')
  async owing(@Req() req: TenantedRequest): Promise<OwingStudent[]> {
    if (req.role === 'teacher') throw new AppError('FORBIDDEN');
    return this.repo.owing(req.workspaceId, await this.groups.visibleTeachers(req));
  }

  @Get('collections')
  async collections(@Req() req: TenantedRequest): Promise<CollectionStats> {
    if (req.role === 'teacher') throw new AppError('FORBIDDEN');
    return this.repo.collections(
      req.workspaceId,
      this.clock.now(),
      await this.groups.visibleTeachers(req),
    );
  }

  /**
   * Policy: by who recorded the payment, not by group. Assistant and teacher: their own takings
   * (a teacher sees only what they took, not the center's money). Owner: every staff member.
   */
  @Get('cash-summary')
  async cashSummary(
    @Req() req: TenantedRequest,
    @Query(new ZodPipe(cashSummaryQuery)) q: CashSummaryQuery,
  ): Promise<CashSummary> {
    const summary = await this.repo.cashSummary(
      req.workspaceId,
      this.clock.now(),
      req.userId,
      q.date,
      req.role === 'owner' ? undefined : req.userId,
    );
    if (!summary) throw new AppError('VALIDATION_FAILED');
    return summary;
  }
}

@Module({
  imports: [AuthModule, WorkspacesModule, GroupsModule],
  controllers: [StatsController],
  providers: [StatsRepository],
})
export class StatsModule {}
