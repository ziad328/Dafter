import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module.js';
import { DevMailController } from './mailer.js';
import { DevicesController, OtpController } from './student-auth.controller.js';
import { StudentAuthRepository } from './student-auth.repository.js';
import { StudentAuthService } from './student-auth.service.js';

@Module({
  imports: [AuthModule],
  controllers: [OtpController, DevicesController, DevMailController],
  providers: [StudentAuthService, StudentAuthRepository],
})
export class StudentAuthModule {}
