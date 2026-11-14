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
  Query,
  Req,
  UseGuards,
} from '@nestjs/common';
import * as z from 'zod';
import {
  type CreateEnrollmentRequest,
  createEnrollmentRequest,
  type CreateStudentRequest,
  type Enrollment,
  createStudentRequest,
  type ListStudentsQuery,
  listStudentsQuery,
  type Student,
  type StudentInvite,
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
    return this.students.list(req, q);
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

  @Get(':id/enrollments')
  enrollments(
    @Req() req: TenantedRequest,
    @Param('id', new ZodPipe(z.uuid())) id: string,
  ): Promise<Enrollment[]> {
    return this.students.listEnrollments(req, id);
  }

  @Post(':id/enrollments')
  enroll(
    @Req() req: TenantedRequest,
    @Param('id', new ZodPipe(z.uuid())) id: string,
    @Body(new ZodPipe(createEnrollmentRequest)) body: CreateEnrollmentRequest,
  ): Promise<Enrollment> {
    return this.students.enroll(req, id, body);
  }

  @Delete(':id/enrollments/:enrollmentId')
  leave(
    @Req() req: TenantedRequest,
    @Param('id', new ZodPipe(z.uuid())) id: string,
    @Param('enrollmentId', new ZodPipe(z.uuid())) enrollmentId: string,
  ): Promise<Enrollment> {
    return this.students.leave(req, id, enrollmentId);
  }

  @Post(':id/invite')
  invite(
    @Req() req: TenantedRequest,
    @Param('id', new ZodPipe(z.uuid())) id: string,
  ): Promise<StudentInvite> {
    return this.students.createInvite(req, id);
  }

  @Delete(':id/device')
  @HttpCode(204)
  async resetDevice(@Req() req: TenantedRequest, @Param('id', new ZodPipe(z.uuid())) id: string) {
    await this.students.resetDevice(req, id, req.userId);
  }
}
