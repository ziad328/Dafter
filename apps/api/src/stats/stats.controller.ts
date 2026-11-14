import { Controller, Get, Inject, Module, Req, UseGuards } from '@nestjs/common';
import type { CollectionStats, OwingStudent, TodayStats } from '@dafter/contracts';
import { AuthGuard } from '../auth/auth.guard.js';
import { AuthModule } from '../auth/auth.module.js';
import { Clock } from '../clock.js';
import { AppError } from '../errors.js';
import { GroupsModule } from '../groups/groups.module.js';
import { GroupsService } from '../groups/groups.service.js';
import { TenantGuard, type TenantedRequest } from '../workspaces/tenant.guard.js';
import { WorkspacesModule } from '../workspaces/workspaces.module.js';
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
}

@Module({
  imports: [AuthModule, WorkspacesModule, GroupsModule],
  controllers: [StatsController],
  providers: [StatsRepository],
})
export class StatsModule {}
