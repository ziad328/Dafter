import {
  Body,
  Controller,
  Get,
  HttpCode,
  Inject,
  Param,
  Post,
  Put,
  Req,
  UseGuards,
} from '@nestjs/common';
import * as z from 'zod';
import {
  type AttendanceRecord,
  type CheckIn,
  type CheckInRequest,
  checkInRequest,
  type MarkAttendanceRequest,
  markAttendanceRequest,
  type OpenSession,
} from '@dafter/contracts';
import { AuthGuard, type AuthedRequest } from '../auth/auth.guard.js';
import { TenantGuard, type TenantedRequest } from '../workspaces/tenant.guard.js';
import { ZodPipe } from '../zod-pipe.js';
import { AttendanceService } from './attendance.service.js';

@Controller('sessions')
@UseGuards(AuthGuard, TenantGuard)
export class SessionAttendanceController {
  constructor(@Inject(AttendanceService) private readonly attendance: AttendanceService) {}

  @Post(':id/open')
  @HttpCode(200)
  open(
    @Req() req: TenantedRequest,
    @Param('id', new ZodPipe(z.uuid())) id: string,
  ): Promise<OpenSession> {
    return this.attendance.open(req, id);
  }

  @Get(':id/attendance')
  list(
    @Req() req: TenantedRequest,
    @Param('id', new ZodPipe(z.uuid())) id: string,
  ): Promise<AttendanceRecord[]> {
    return this.attendance.list(req, id);
  }

  @Put(':id/attendance/:studentId')
  mark(
    @Req() req: TenantedRequest,
    @Param('id', new ZodPipe(z.uuid())) id: string,
    @Param('studentId', new ZodPipe(z.uuid())) studentId: string,
    @Body(new ZodPipe(markAttendanceRequest)) body: MarkAttendanceRequest,
  ): Promise<AttendanceRecord> {
    return this.attendance.mark(req, id, studentId, body, req.userId);
  }
}

@Controller('check-ins')
export class CheckInsController {
  constructor(@Inject(AttendanceService) private readonly attendance: AttendanceService) {}

  @Post()
  @HttpCode(200)
  @UseGuards(AuthGuard)
  checkIn(
    @Req() req: AuthedRequest,
    @Body(new ZodPipe(checkInRequest)) body: CheckInRequest,
  ): Promise<CheckIn> {
    return this.attendance.checkIn(req.userId, body);
  }
}
