import {
  Body,
  Controller,
  Get,
  Inject,
  Module,
  Param,
  Patch,
  Post,
  Put,
  Req,
  UseGuards,
} from '@nestjs/common';
import * as z from 'zod';
import {
  createCurriculumRequest,
  reorderCurriculumRequest,
  updateCurriculumRequest,
  type CreateCurriculumRequest,
  type CurriculumEntry,
  type ReorderCurriculumRequest,
  type UpdateCurriculumRequest,
} from '@dafter/contracts';
import { gradeLevels, subjects } from '@dafter/db';
import { AuthGuard } from '../auth/auth.guard.js';
import { AuthModule } from '../auth/auth.module.js';
import { AppError } from '../errors.js';
import { curriculumNameTaken } from '../rooms/pg-errors.js';
import { TenantGuard, type TenantedRequest } from '../workspaces/tenant.guard.js';
import { WorkspacesModule } from '../workspaces/workspaces.module.js';
import { ZodPipe } from '../zod-pipe.js';
import { CurriculumRepository, type CurriculumTable } from './curriculum.repository.js';

const idParam = new ZodPipe(z.uuid());
const createBody = new ZodPipe(createCurriculumRequest);
const updateBody = new ZodPipe(updateCurriculumRequest);
const reorderBody = new ZodPipe(reorderCurriculumRequest);

/**
 * Policy: every staff role reads the curriculum (group and student forms pick from it); only the
 * owner adds, renames, archives, restores or reorders. Nothing is deleted: groups and students point at it.
 */
@Controller()
@UseGuards(AuthGuard, TenantGuard)
export class CurriculumController {
  constructor(@Inject(CurriculumRepository) private readonly repo: CurriculumRepository) {}

  @Get('subjects')
  subjects(@Req() req: TenantedRequest): Promise<CurriculumEntry[]> {
    return this.repo.list(req.workspaceId, subjects);
  }

  @Post('subjects')
  createSubject(
    @Req() req: TenantedRequest,
    @Body(createBody) body: CreateCurriculumRequest,
  ): Promise<CurriculumEntry> {
    return this.create(req, subjects, body);
  }

  // Before subjects/:id, so "order" is never read as an id.
  @Put('subjects/order')
  reorderSubjects(
    @Req() req: TenantedRequest,
    @Body(reorderBody) body: ReorderCurriculumRequest,
  ): Promise<CurriculumEntry[]> {
    return this.reorder(req, subjects, body);
  }

  @Patch('subjects/:id')
  updateSubject(
    @Req() req: TenantedRequest,
    @Param('id', idParam) id: string,
    @Body(updateBody) body: UpdateCurriculumRequest,
  ): Promise<CurriculumEntry> {
    return this.update(req, subjects, id, body);
  }

  @Get('grade-levels')
  gradeLevels(@Req() req: TenantedRequest): Promise<CurriculumEntry[]> {
    return this.repo.list(req.workspaceId, gradeLevels);
  }

  @Post('grade-levels')
  createGradeLevel(
    @Req() req: TenantedRequest,
    @Body(createBody) body: CreateCurriculumRequest,
  ): Promise<CurriculumEntry> {
    return this.create(req, gradeLevels, body);
  }

  @Put('grade-levels/order')
  reorderGradeLevels(
    @Req() req: TenantedRequest,
    @Body(reorderBody) body: ReorderCurriculumRequest,
  ): Promise<CurriculumEntry[]> {
    return this.reorder(req, gradeLevels, body);
  }

  @Patch('grade-levels/:id')
  updateGradeLevel(
    @Req() req: TenantedRequest,
    @Param('id', idParam) id: string,
    @Body(updateBody) body: UpdateCurriculumRequest,
  ): Promise<CurriculumEntry> {
    return this.update(req, gradeLevels, id, body);
  }

  private create(req: TenantedRequest, table: CurriculumTable, body: CreateCurriculumRequest) {
    if (req.role !== 'owner') throw new AppError('FORBIDDEN');
    return this.repo.create(req.workspaceId, table, body).catch(curriculumNameTaken);
  }

  private async reorder(
    req: TenantedRequest,
    table: CurriculumTable,
    body: ReorderCurriculumRequest,
  ) {
    if (req.role !== 'owner') throw new AppError('FORBIDDEN');
    if (!(await this.repo.reorder(req.workspaceId, table, body.ids)))
      throw new AppError('CURRICULUM_ORDER_STALE');
    return this.repo.list(req.workspaceId, table);
  }

  private async update(
    req: TenantedRequest,
    table: CurriculumTable,
    id: string,
    body: UpdateCurriculumRequest,
  ) {
    if (req.role !== 'owner') throw new AppError('FORBIDDEN');
    const item = await this.repo
      .update(req.workspaceId, table, id, body)
      .catch(curriculumNameTaken);
    if (!item) throw new AppError('CURRICULUM_ITEM_NOT_FOUND');
    return item;
  }
}

@Module({
  imports: [AuthModule, WorkspacesModule],
  controllers: [CurriculumController],
  providers: [CurriculumRepository],
})
export class CurriculumModule {}
