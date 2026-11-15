import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module.js';
import { GroupsModule } from '../groups/groups.module.js';
import { WorkspacesModule } from '../workspaces/workspaces.module.js';
import { ExamsController, GroupExamsController } from './exams.controller.js';
import { ExamsRepository } from './exams.repository.js';
import { ExamsService } from './exams.service.js';

@Module({
  imports: [AuthModule, WorkspacesModule, GroupsModule],
  controllers: [GroupExamsController, ExamsController],
  providers: [ExamsService, ExamsRepository],
})
export class ExamsModule {}
