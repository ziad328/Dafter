import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module.js';
import { MyStudentController } from './me.controller.js';
import { MeRepository } from './me.repository.js';

@Module({
  imports: [AuthModule],
  controllers: [MyStudentController],
  providers: [MeRepository],
})
export class MeModule {}
