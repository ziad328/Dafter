import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module.js';
import { WorkspacesModule } from '../workspaces/workspaces.module.js';
import {
  FakePhoneController,
  MessagesController,
  MessagesRepository,
  TemplatesRepository,
} from './messages.controller.js';

@Module({
  imports: [AuthModule, WorkspacesModule],
  controllers: [MessagesController, FakePhoneController],
  providers: [MessagesRepository, TemplatesRepository],
})
export class MessagesModule {}
