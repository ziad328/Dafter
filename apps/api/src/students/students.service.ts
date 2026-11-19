import { randomBytes } from 'node:crypto';
import { Inject, Injectable } from '@nestjs/common';
import {
  type CreateEnrollmentRequest,
  type CreateStudentRequest,
  type Enrollment,
  type ListStudentsQuery,
  normalizeArabic,
  type Student,
  type StudentInvite,
  type UpdateStudentRequest,
} from '@dafter/contracts';
import { hashToken } from '../auth/auth.service.js';
import { Clock } from '../clock.js';
import { AppError } from '../errors.js';
import { GroupsService } from '../groups/groups.service.js';
import { INVITE_TTL_MS } from '../members/members.service.js';
import type { TenantedRequest } from '../workspaces/tenant.guard.js';
import { StudentsRepository } from './students.repository.js';

type Ctx = Pick<TenantedRequest, 'workspaceId' | 'role' | 'membershipId'>;

const nameSearch = (nameAr: string, nameEn?: string | null) =>
  normalizeArabic(`${nameAr} ${nameEn ?? ''}`);

/**
 * Policy: students belong to the whole workspace, so every staff role (owner, teacher,
 * assistant) reads, creates and edits them. Narrow teachers to their enrolled students later.
 */
@Injectable()
export class StudentsService {
  constructor(
    @Inject(StudentsRepository) private readonly repo: StudentsRepository,
    @Inject(GroupsService) private readonly groups: GroupsService,
    @Inject(Clock) private readonly clock: Clock,
  ) {}

  list(ctx: Ctx, query: ListStudentsQuery = {}): Promise<Student[]> {
    const { q, groupId, gradeLevelId, owes } = query;
    return this.repo.search(ctx.workspaceId, q ? normalizeArabic(q) : '', {
      groupId,
      gradeLevelId,
      owes: owes === 'true',
    });
  }

  async get(ctx: Ctx, id: string): Promise<Student> {
    const student = await this.repo.find(ctx.workspaceId, id);
    if (!student) throw new AppError('STUDENT_NOT_FOUND');
    return student;
  }

  async create(ctx: Ctx, body: CreateStudentRequest): Promise<Student> {
    await this.checkGrade(ctx, body.gradeLevelId);
    const { guardian, ...values } = body;
    const id = await this.repo.create(
      ctx.workspaceId,
      { ...values, nameSearch: nameSearch(values.nameAr, values.nameEn) },
      guardian,
    );
    return this.get(ctx, id);
  }

  async update(ctx: Ctx, id: string, body: UpdateStudentRequest): Promise<Student> {
    const current = await this.get(ctx, id);
    // An archived grade may stay on the student; only a newly picked one must be active.
    if (body.gradeLevelId && body.gradeLevelId !== current.gradeLevel.id)
      await this.checkGrade(ctx, body.gradeLevelId);
    const { guardian, ...patch } = body;
    const search = nameSearch(
      patch.nameAr ?? current.nameAr,
      patch.nameEn === undefined ? current.nameEn : patch.nameEn,
    );
    await this.repo.update(ctx.workspaceId, id, { ...patch, nameSearch: search }, guardian);
    return this.get(ctx, id);
  }

  async listEnrollments(ctx: Ctx, studentId: string): Promise<Enrollment[]> {
    await this.get(ctx, studentId);
    return this.repo.enrollments(ctx.workspaceId, studentId);
  }

  /** Into a group the caller can see (teacher: own, assistant: assigned teachers', owner: all). */
  async enroll(ctx: Ctx, studentId: string, body: CreateEnrollmentRequest): Promise<Enrollment> {
    await this.get(ctx, studentId);
    const group = await this.groups.get(ctx, body.groupId);
    if (group.status !== 'active')
      throw new AppError('STUDENT_REFERENCE_INVALID', { field: 'groupId' });
    const id = await this.repo.enroll(
      ctx.workspaceId,
      {
        studentId,
        groupId: group.id,
        discountPct: body.discountPct ?? 0,
        joinedAt: this.clock.now(),
      },
      body.force,
    );
    if (!id) throw new AppError('ENROLLMENT_EXISTS');
    return this.enrollment(ctx, studentId, id);
  }

  async leave(ctx: Ctx, studentId: string, enrollmentId: string): Promise<Enrollment> {
    const current = await this.enrollment(ctx, studentId, enrollmentId);
    await this.groups.get(ctx, current.groupId).catch((err: unknown) => {
      if (err instanceof AppError && err.code === 'GROUP_NOT_FOUND')
        throw new AppError('ENROLLMENT_NOT_FOUND');
      throw err;
    });
    if (!(await this.repo.leave(ctx.workspaceId, studentId, enrollmentId, this.clock.now())))
      throw new AppError('ENROLLMENT_NOT_FOUND');
    return this.enrollment(ctx, studentId, enrollmentId);
  }

  /** The token is returned once; only its hash is stored. */
  async createInvite(ctx: Ctx, studentId: string): Promise<StudentInvite> {
    const student = await this.get(ctx, studentId);
    if (student.activated) throw new AppError('STUDENT_ALREADY_ACTIVATED');
    const token = randomBytes(32).toString('base64url');
    const now = this.clock.now();
    const expiresAt = new Date(now.getTime() + INVITE_TTL_MS);
    await this.repo.createInvite(ctx.workspaceId, studentId, hashToken(token), now, expiresAt);
    return { token, expiresAt: expiresAt.toISOString() };
  }

  async resetDevice(ctx: Ctx, studentId: string, actorId: string) {
    if (!(await this.repo.resetDevice(ctx.workspaceId, studentId, actorId, this.clock.now())))
      throw new AppError('STUDENT_NOT_FOUND');
  }

  private async enrollment(ctx: Ctx, studentId: string, id: string) {
    const [row] = await this.repo.enrollments(ctx.workspaceId, studentId, id);
    if (!row) throw new AppError('ENROLLMENT_NOT_FOUND');
    return row;
  }

  private async checkGrade(ctx: Ctx, gradeLevelId: string) {
    if (!(await this.repo.gradeActive(ctx.workspaceId, gradeLevelId)))
      throw new AppError('STUDENT_REFERENCE_INVALID', { field: 'gradeLevelId' });
  }
}
