import { randomUUID } from 'node:crypto';
import { Inject, Injectable } from '@nestjs/common';
import type { CreateWorkspaceRequest, Workspace } from '@dafter/contracts';
import { AppError } from '../errors.js';
import { WorkspacesRepository } from './workspaces.repository.js';

@Injectable()
export class WorkspacesService {
  constructor(@Inject(WorkspacesRepository) private readonly repo: WorkspacesRepository) {}

  // The id is made here so the insert can run under RLS for that id.
  create(userId: string, body: CreateWorkspaceRequest) {
    return this.repo.create(randomUUID(), userId, body);
  }

  list(userId: string) {
    return this.repo.listForUser(userId);
  }

  async current(workspaceId: string, role: Workspace['role']): Promise<Workspace> {
    const row = await this.repo.find(workspaceId);
    if (!row) throw new AppError('WORKSPACE_NOT_FOUND');
    return { ...row, role };
  }
}
