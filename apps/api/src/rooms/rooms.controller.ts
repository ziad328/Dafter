import {
  Body,
  Controller,
  Get,
  Inject,
  Module,
  Param,
  Patch,
  Post,
  Req,
  UseGuards,
} from '@nestjs/common';
import * as z from 'zod';
import {
  createRoomRequest,
  updateRoomRequest,
  type CreateRoomRequest,
  type Room,
  type UpdateRoomRequest,
} from '@dafter/contracts';
import { AuthGuard } from '../auth/auth.guard.js';
import { AuthModule } from '../auth/auth.module.js';
import { AppError } from '../errors.js';
import { TenantGuard, type TenantedRequest } from '../workspaces/tenant.guard.js';
import { WorkspacesModule } from '../workspaces/workspaces.module.js';
import { ZodPipe } from '../zod-pipe.js';
import { roomNameTaken } from './pg-errors.js';
import { RoomsRepository } from './rooms.repository.js';

/** Policy: every staff role reads rooms (to see where groups meet); only the owner manages them. */
@Controller('rooms')
@UseGuards(AuthGuard, TenantGuard)
export class RoomsController {
  constructor(@Inject(RoomsRepository) private readonly repo: RoomsRepository) {}

  @Get()
  list(@Req() req: TenantedRequest): Promise<Room[]> {
    return this.repo.list(req.workspaceId);
  }

  @Post()
  create(
    @Req() req: TenantedRequest,
    @Body(new ZodPipe(createRoomRequest)) body: CreateRoomRequest,
  ): Promise<Room> {
    if (req.role !== 'owner') throw new AppError('FORBIDDEN');
    return this.repo.create(req.workspaceId, body).catch(roomNameTaken);
  }

  @Patch(':id')
  async update(
    @Req() req: TenantedRequest,
    @Param('id', new ZodPipe(z.uuid())) id: string,
    @Body(new ZodPipe(updateRoomRequest)) body: UpdateRoomRequest,
  ): Promise<Room> {
    if (req.role !== 'owner') throw new AppError('FORBIDDEN');
    const room = await this.repo.update(req.workspaceId, id, body).catch(roomNameTaken);
    if (!room) throw new AppError('ROOM_NOT_FOUND');
    return room;
  }
}

@Module({
  imports: [AuthModule, WorkspacesModule],
  controllers: [RoomsController],
  providers: [RoomsRepository],
})
export class RoomsModule {}
