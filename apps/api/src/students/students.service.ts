import { Inject, Injectable } from '@nestjs/common';
import {
  type CreateStudentRequest,
  normalizeArabic,
  type Student,
  type UpdateStudentRequest,
} from '@dafter/contracts';
import { AppError } from '../errors.js';
import type { TenantedRequest } from '../workspaces/tenant.guard.js';
import { StudentsRepository } from './students.repository.js';

type Ctx = Pick<TenantedRequest, 'workspaceId'>;

const nameSearch = (nameAr: string, nameEn?: string | null) =>
  normalizeArabic(`${nameAr} ${nameEn ?? ''}`);

/**
 * Policy: students belong to the whole workspace, so every staff role (owner, teacher,
 * assistant) reads, creates and edits them. Narrow teachers to their enrolled students later.
 */
@Injectable()
export class StudentsService {
  constructor(@Inject(StudentsRepository) private readonly repo: StudentsRepository) {}

  list(ctx: Ctx, q?: string): Promise<Student[]> {
    return this.repo.search(ctx.workspaceId, q ? normalizeArabic(q) : '');
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
    if (body.gradeLevelId) await this.checkGrade(ctx, body.gradeLevelId);
    const { guardian, ...patch } = body;
    const search = nameSearch(
      patch.nameAr ?? current.nameAr,
      patch.nameEn === undefined ? current.nameEn : patch.nameEn,
    );
    await this.repo.update(ctx.workspaceId, id, { ...patch, nameSearch: search }, guardian);
    return this.get(ctx, id);
  }

  private async checkGrade(ctx: Ctx, gradeLevelId: string) {
    if (!(await this.repo.gradeExists(ctx.workspaceId, gradeLevelId)))
      throw new AppError('STUDENT_REFERENCE_INVALID', { field: 'gradeLevelId' });
  }
}
