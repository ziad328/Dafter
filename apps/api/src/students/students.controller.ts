import {
  Body,
  Controller,
  Get,
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
  type CreateStudentRequest,
  createStudentRequest,
  type ListStudentsQuery,
  listStudentsQuery,
  type Student,
  type UpdateStudentRequest,
  updateStudentRequest,
} from '@dafter/contracts';
import type { AuditedRequest } from '../audit.interceptor.js';
import { AuthGuard } from '../auth/auth.guard.js';
import { TenantGuard, type TenantedRequest } from '../workspaces/tenant.guard.js';
import { ZodPipe } from '../zod-pipe.js';
import { StudentsService } from './students.service.js';

@Controller('students')
@UseGuards(AuthGuard, TenantGuard)
export class StudentsController {
  constructor(@Inject(StudentsService) private readonly students: StudentsService) {}

  @Get()
  list(
    @Req() req: TenantedRequest,
    @Query(new ZodPipe(listStudentsQuery)) q: ListStudentsQuery,
  ): Promise<Student[]> {
    return this.students.list(req, q.q);
  }

  @Post()
  async create(
    @Req() req: TenantedRequest & AuditedRequest,
    @Body(new ZodPipe(createStudentRequest)) body: CreateStudentRequest,
  ): Promise<Student> {
    const student = await this.students.create(req, body);
    req.audit = { entityId: student.id };
    return student;
  }

  @Get(':id')
  get(
    @Req() req: TenantedRequest,
    @Param('id', new ZodPipe(z.uuid())) id: string,
  ): Promise<Student> {
    return this.students.get(req, id);
  }

  @Patch(':id')
  update(
    @Req() req: TenantedRequest,
    @Param('id', new ZodPipe(z.uuid())) id: string,
    @Body(new ZodPipe(updateStudentRequest)) body: UpdateStudentRequest,
  ): Promise<Student> {
    return this.students.update(req, id, body);
  }
}
