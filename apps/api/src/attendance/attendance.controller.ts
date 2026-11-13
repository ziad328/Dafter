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
  type CheckIn,
  type CheckInRequest,
  checkInRequest,
  type MarkAttendanceRequest,
  markAttendanceRequest,
  type OpenSession,
} from '@dafter/contracts';
import { AuthGuard, type AuthedRequest } from '../auth/auth.guard.js';
import { TenantGuard, type TenantedRequest } from '../workspaces/tenant.guard.js';
import { SessionsService } from '../sessions/sessions.service.js';
import { ZodPipe } from '../zod-pipe.js';
import { AppError } from '../errors.js';
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
  ): Promise<AttendanceRecord[]> {
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
