import {
  Body,
  type CanActivate,
  Controller,
  type ExecutionContext,
  Get,
  HttpCode,
  Inject,
  Injectable,
  Param,
  Post,
  Put,
  Req,
  Sse,
  UseGuards,
} from '@nestjs/common';
import { interval, map, merge, type Observable } from 'rxjs';
import * as z from 'zod';
import {
  type AttendanceRecord,
  type AttendanceSettings,
  attendanceSettings,
  type CheckIn,
  type CheckInRequest,
  checkInRequest,
  type CloseSessionResult,
  type MarkAttendanceRequest,
  markAttendanceRequest,
  type OpenSession,
  type RosterEntry,
} from '@dafter/contracts';
import { AuthGuard, type AuthedRequest } from '../auth/auth.guard.js';
import { TenantGuard, type TenantedRequest } from '../workspaces/tenant.guard.js';
import { SessionsService } from '../sessions/sessions.service.js';
import { ZodPipe } from '../zod-pipe.js';
import { AppError } from '../errors.js';
import type { AuditedRequest } from '../audit.interceptor.js';
import { AttendanceRepository } from './attendance.repository.js';
import { AttendanceService } from './attendance.service.js';

/**
 * An SSE handler's errors arrive after the 200 and the stream headers, so the 404 for a session
 * outside the caller's view has to come from a guard, which runs first.
 */
@Injectable()
class SessionVisibleGuard implements CanActivate {
  constructor(@Inject(SessionsService) private readonly sessions: SessionsService) {}

  async canActivate(ctx: ExecutionContext) {
    const req = ctx.switchToHttp().getRequest<TenantedRequest & { params: { id: string } }>();
    if (!z.uuid().safeParse(req.params.id).success) throw new AppError('VALIDATION_FAILED');
    await this.sessions.get(req, req.params.id);
    return true;
  }
}

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

  @Post(':id/close')
  @HttpCode(200)
  close(
    @Req() req: TenantedRequest,
    @Param('id', new ZodPipe(z.uuid())) id: string,
  ): Promise<CloseSessionResult> {
    return this.attendance.close(req, id, req.userId);
  }

  // A comment-like ping every 25 s keeps proxies from closing an idle stream.
  @Sse(':id/live')
  @UseGuards(SessionVisibleGuard)
  live(
    @Req() req: TenantedRequest,
    @Param('id', new ZodPipe(z.uuid())) id: string,
  ): Observable<{ type?: string; data: unknown }> {
    return merge(
      this.attendance.liveFeed(req, id).pipe(map((data) => ({ data }))),
      interval(25_000).pipe(map(() => ({ type: 'ping', data: '' }))),
    );
  }

  @Get(':id/roster')
  roster(
    @Req() req: TenantedRequest,
    @Param('id', new ZodPipe(z.uuid())) id: string,
  ): Promise<RosterEntry[]> {
    return this.attendance.roster(req, id);
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

/** Policy: every staff role reads the late threshold (the live screen shows it); the owner sets it. */
@Controller('attendance-settings')
@UseGuards(AuthGuard, TenantGuard)
export class AttendanceSettingsController {
  constructor(@Inject(AttendanceRepository) private readonly repo: AttendanceRepository) {}

  @Get()
  get(@Req() req: TenantedRequest): Promise<AttendanceSettings> {
    return this.repo.settings(req.workspaceId);
  }

  @Put()
  set(
    @Req() req: TenantedRequest & AuditedRequest,
    @Body(new ZodPipe(attendanceSettings)) body: AttendanceSettings,
  ): Promise<AttendanceSettings> {
    if (req.role !== 'owner') throw new AppError('FORBIDDEN');
    req.audit = { entityId: req.workspaceId };
    return this.repo.setSettings(req.workspaceId, body);
  }
}
