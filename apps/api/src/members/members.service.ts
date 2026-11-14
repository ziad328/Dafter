import { randomBytes } from 'node:crypto';
import { Inject, Injectable } from '@nestjs/common';
import type { CreateInviteRequest, Invite, StaffResetLink, Workspace } from '@dafter/contracts';
import { hashToken } from '../auth/auth.service.js';
import { Clock } from '../clock.js';
import { AppError } from '../errors.js';
import { WorkspacesRepository } from '../workspaces/workspaces.repository.js';
import { MembersRepository } from './members.repository.js';

type Role = Workspace['role'];

export const INVITE_TTL_MS = 72 * 60 * 60 * 1000;
// Longer than the emailed link (30 minutes): the owner passes it on by hand.
export const STAFF_RESET_TTL_MS = 24 * 60 * 60 * 1000;

/** Policy: only the owner manages people (invites, assistant scopes). */
function requireOwner(role: Role) {
  if (role !== 'owner') throw new AppError('FORBIDDEN');
}

@Injectable()
export class MembersService {
  constructor(
    @Inject(MembersRepository) private readonly repo: MembersRepository,
    @Inject(WorkspacesRepository) private readonly workspaces: WorkspacesRepository,
    @Inject(Clock) private readonly clock: Clock,
  ) {}

  async createInvite(workspaceId: string, role: Role, body: CreateInviteRequest): Promise<Invite> {
    requireOwner(role);
    const token = randomBytes(32).toString('base64url');
    const expiresAt = new Date(this.clock.now().getTime() + INVITE_TTL_MS);
    const { id } = await this.repo.createInvite(
      workspaceId,
      body.role,
      hashToken(token),
      expiresAt,
    );
    return { id, role: body.role, token, expiresAt: expiresAt.toISOString() };
  }

  async resetLink(workspaceId: string, role: Role, memberId: string): Promise<StaffResetLink> {
    requireOwner(role);
    const token = randomBytes(32).toString('base64url');
    const expiresAt = new Date(this.clock.now().getTime() + STAFF_RESET_TTL_MS);
    const result = await this.repo.issueReset(workspaceId, memberId, hashToken(token), expiresAt);
    if (result === 'not_found') throw new AppError('NOT_FOUND');
    if (result === 'not_allowed') throw new AppError('RESET_NOT_ALLOWED');
    return { token, expiresAt: expiresAt.toISOString() };
  }

  async accept(userId: string, token: string) {
    const tokenHash = hashToken(token);
    const workspaceId = await this.repo.findInviteWorkspace(tokenHash);
    if (!workspaceId) throw new AppError('INVITE_INVALID');
    const { inviteId, role } = await this.repo.accept(
      workspaceId,
      tokenHash,
      userId,
      this.clock.now(),
    );
    const ws = await this.workspaces.find(workspaceId);
    const workspace: Workspace = { ...ws!, role };
    return { workspace, inviteId };
  }

  list(workspaceId: string) {
    return this.repo.list(workspaceId);
  }

  async setScopes(workspaceId: string, role: Role, memberId: string, teacherIds: string[]) {
    requireOwner(role);
    const [member] = await this.repo.roles(workspaceId, [memberId]);
    if (!member) throw new AppError('NOT_FOUND');
    if (member.role !== 'assistant') throw new AppError('MEMBER_NOT_ASSISTANT');
    const ids = [...new Set(teacherIds)];
    // Owners teach too (an independent teacher owns their workspace).
    const teachers = (await this.repo.roles(workspaceId, ids)).filter(
      (m) => m.role !== 'assistant',
    );
    if (teachers.length !== ids.length) throw new AppError('SCOPE_TEACHER_INVALID');
    await this.repo.replaceScopes(workspaceId, memberId, ids);
  }
}
