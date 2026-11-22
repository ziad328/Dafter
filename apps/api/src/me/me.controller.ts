import { Controller, Get, Inject, Req, UseGuards } from '@nestjs/common';
import type { MyAttendanceRecord, MyBalance, MyGrade, MySession } from '@dafter/contracts';
import { AuthGuard, type AuthedRequest } from '../auth/auth.guard.js';
import { Clock } from '../clock.js';
import { MeRepository } from './me.repository.js';

const HOUR = 60 * 60 * 1000;

/** The student app's own reads. Staff logins have no student records, so they get []. */
@Controller('me')
@UseGuards(AuthGuard)
export class MyStudentController {
  constructor(
    @Inject(MeRepository) private readonly repo: MeRepository,
    @Inject(Clock) private readonly clock: Clock,
  ) {}

  @Get('schedule')
  schedule(@Req() req: AuthedRequest): Promise<MySession[]> {
    const now = this.clock.now().getTime();
    // From 3 hours ago, so a session in progress still shows.
    return this.repo.schedule(req.userId, new Date(now - 3 * HOUR), new Date(now + 14 * 24 * HOUR));
  }

  @Get('attendance')
  attendance(@Req() req: AuthedRequest): Promise<MyAttendanceRecord[]> {
    return this.repo.attendance(req.userId, 50);
  }

  @Get('balance')
  balance(@Req() req: AuthedRequest): Promise<MyBalance[]> {
    return this.repo.balance(req.userId, 20);
  }

  @Get('grades')
  grades(@Req() req: AuthedRequest): Promise<MyGrade[]> {
    return this.repo.grades(req.userId, 50);
  }
}
