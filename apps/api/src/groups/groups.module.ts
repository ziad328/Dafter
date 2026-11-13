import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module.js';
import { WorkspacesModule } from '../workspaces/workspaces.module.js';
import { CurriculumController, GroupsController } from './groups.controller.js';
import { GroupsRepository } from './groups.repository.js';
import { GroupsService } from './groups.service.js';

@Module({
  imports: [AuthModule, WorkspacesModule],
  controllers: [CurriculumController, GroupsController],
  providers: [GroupsService, GroupsRepository],
})
export class GroupsModule {}
