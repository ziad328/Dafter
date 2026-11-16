import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module.js';
import { DevMailController } from './mailer.js';
import {
  DevicesController,
  OtpController,
  StudentInvitePreviewController,
} from './student-auth.controller.js';
import { StudentAuthRepository } from './student-auth.repository.js';
import { StudentAuthService } from './student-auth.service.js';

@Module({
  imports: [AuthModule],
  controllers: [
    OtpController,
    StudentInvitePreviewController,
    DevicesController,
    DevMailController,
  ],
  providers: [StudentAuthService, StudentAuthRepository],
})
export class StudentAuthModule {}
