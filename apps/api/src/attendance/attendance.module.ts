import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module.js';
import { SessionsModule } from '../sessions/sessions.module.js';
import { WorkspacesModule } from '../workspaces/workspaces.module.js';
import {
  AttendanceSettingsController,
  CheckInsController,
  SessionAttendanceController,
} from './attendance.controller.js';
import { AttendanceRepository } from './attendance.repository.js';
import { AttendanceService } from './attendance.service.js';

@Module({
  imports: [AuthModule, WorkspacesModule, SessionsModule],
  controllers: [SessionAttendanceController, CheckInsController, AttendanceSettingsController],
  providers: [AttendanceService, AttendanceRepository],
})
export class AttendanceModule {}
