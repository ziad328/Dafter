import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module.js';
import { GroupsModule } from '../groups/groups.module.js';
import { WorkspacesModule } from '../workspaces/workspaces.module.js';
import { MoneyController } from './money.controller.js';
import { MoneyRepository } from './money.repository.js';
import { MoneyService } from './money.service.js';

@Module({
  imports: [AuthModule, WorkspacesModule, GroupsModule],
  controllers: [MoneyController],
  providers: [MoneyService, MoneyRepository],
})
export class MoneyModule {}
