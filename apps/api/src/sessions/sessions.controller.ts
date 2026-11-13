import {
  Body,
  Controller,
  Get,
  HttpCode,
  Inject,
  Param,
  Patch,
  Post,
  Query,
  Req,
  UseGuards,
} from '@nestjs/common';
import * as z from 'zod';
import {
  type ListSessionsQuery,
  listSessionsQuery,
  type MoveSessionRequest,
  moveSessionRequest,
  type Session,
} from '@dafter/contracts';
import { AuthGuard } from '../auth/auth.guard.js';
import { TenantGuard, type TenantedRequest } from '../workspaces/tenant.guard.js';
import { ZodPipe } from '../zod-pipe.js';
import { SessionsService } from './sessions.service.js';

@Controller('sessions')
@UseGuards(AuthGuard, TenantGuard)
export class SessionsController {
  constructor(@Inject(SessionsService) private readonly sessions: SessionsService) {}

  @Get()
  list(
    @Req() req: TenantedRequest,
    @Query(new ZodPipe(listSessionsQuery)) q: ListSessionsQuery,
  ): Promise<Session[]> {
    return this.sessions.list(req, q);
  }

  @Post(':id/cancel')
  @HttpCode(200)
  cancel(
    @Req() req: TenantedRequest,
    @Param('id', new ZodPipe(z.uuid())) id: string,
  ): Promise<Session> {
    return this.sessions.cancel(req, id);
  }

  @Patch(':id')
  move(
    @Req() req: TenantedRequest,
    @Param('id', new ZodPipe(z.uuid())) id: string,
    @Body(new ZodPipe(moveSessionRequest)) body: MoveSessionRequest,
  ): Promise<Session> {
    return this.sessions.move(req, id, body);
  }
}
