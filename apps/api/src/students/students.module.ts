import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module.js';
import { GroupsModule } from '../groups/groups.module.js';
import { WorkspacesModule } from '../workspaces/workspaces.module.js';
import { StudentsController } from './students.controller.js';
import { StudentsRepository } from './students.repository.js';
import { StudentsService } from './students.service.js';

@Module({
  imports: [AuthModule, WorkspacesModule, GroupsModule],
  controllers: [StudentsController],
  providers: [StudentsService, StudentsRepository],
})
export class StudentsModule {}
