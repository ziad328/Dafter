import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module.js';
import { WorkspacesModule } from '../workspaces/workspaces.module.js';
import { InvitesController, MembersController } from './members.controller.js';
import { MembersRepository } from './members.repository.js';
import { MembersService } from './members.service.js';

@Module({
  imports: [AuthModule, WorkspacesModule],
  controllers: [InvitesController, MembersController],
  providers: [MembersService, MembersRepository],
})
export class MembersModule {}
