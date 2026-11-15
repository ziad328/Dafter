import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  Inject,
  Param,
  Patch,
  Post,
  Put,
  Req,
  UseGuards,
} from '@nestjs/common';
import * as z from 'zod';
import {
  type CreateExamRequest,
  createExamRequest,
  type Exam,
  type ExamSheet,
  type NotifyExamResponse,
  type SaveExamResultsRequest,
  saveExamResultsRequest,
  type UpdateExamRequest,
  updateExamRequest,
} from '@dafter/contracts';
import type { AuditedRequest } from '../audit.interceptor.js';
import { AuthGuard } from '../auth/auth.guard.js';
import { TenantGuard, type TenantedRequest } from '../workspaces/tenant.guard.js';
import { ZodPipe } from '../zod-pipe.js';
import { ExamsService } from './exams.service.js';

const uuid = new ZodPipe(z.uuid());

@Controller('groups')
@UseGuards(AuthGuard, TenantGuard)
export class GroupExamsController {
  constructor(@Inject(ExamsService) private readonly exams: ExamsService) {}

  @Get(':id/exams')
  list(@Req() req: TenantedRequest, @Param('id', uuid) id: string): Promise<Exam[]> {
    return this.exams.list(req, id);
  }

  @Post(':id/exams')
  async create(
    @Req() req: TenantedRequest & AuditedRequest,
    @Param('id', uuid) id: string,
    @Body(new ZodPipe(createExamRequest)) body: CreateExamRequest,
  ): Promise<Exam> {
    const exam = await this.exams.create(req, id, body);
    req.audit = { entityId: exam.id };
    return exam;
  }
}

@Controller('exams')
@UseGuards(AuthGuard, TenantGuard)
export class ExamsController {
  constructor(@Inject(ExamsService) private readonly exams: ExamsService) {}

  @Get(':id')
  sheet(@Req() req: TenantedRequest, @Param('id', uuid) id: string): Promise<ExamSheet> {
    return this.exams.sheet(req, id);
  }

  @Patch(':id')
  update(
    @Req() req: TenantedRequest,
    @Param('id', uuid) id: string,
    @Body(new ZodPipe(updateExamRequest)) body: UpdateExamRequest,
  ): Promise<Exam> {
    return this.exams.update(req, id, body);
  }

  @Delete(':id')
  @HttpCode(204)
  remove(@Req() req: TenantedRequest, @Param('id', uuid) id: string): Promise<void> {
    return this.exams.remove(req, id);
  }

  @Put(':id/results')
  save(
    @Req() req: TenantedRequest,
    @Param('id', uuid) id: string,
    @Body(new ZodPipe(saveExamResultsRequest)) body: SaveExamResultsRequest,
  ): Promise<ExamSheet> {
    return this.exams.save(req, id, body);
  }

  @Post(':id/notify')
  @HttpCode(200)
  notify(@Req() req: TenantedRequest, @Param('id', uuid) id: string): Promise<NotifyExamResponse> {
    return this.exams.notify(req, id);
  }
}
