import { randomBytes } from 'node:crypto';
import { Inject, Injectable } from '@nestjs/common';
import type {
  CreateInviteRequest,
  Invite,
  InvitePreview,
  Member,
  PendingInvite,
  StaffResetLink,
  UpdateMemberRequest,
  Workspace,
} from '@dafter/contracts';
import { hashToken } from '../auth/auth.service.js';
import { Clock } from '../clock.js';
import { AppError } from '../errors.js';
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
    @Inject(Clock) private readonly clock: Clock,
  ) {}

  async createInvite(
    workspaceId: string,
    membershipId: string,
    role: Role,
    body: CreateInviteRequest,
  ): Promise<Invite> {
    requireOwner(role);
    const teacherMembershipIds = [...new Set(body.teacherMembershipIds ?? [])];
    await this.checkTeachers(workspaceId, teacherMembershipIds);
    const token = randomBytes(32).toString('base64url');
    const expiresAt = new Date(this.clock.now().getTime() + INVITE_TTL_MS);
    const { id } = await this.repo.createInvite(
      workspaceId,
      membershipId,
      body.role,
      teacherMembershipIds,
      hashToken(token),
      expiresAt,
    );
    return {
      id,
      role: body.role,
      token,
      expiresAt: expiresAt.toISOString(),
      teacherMembershipIds,
    };
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

  async preview(token: string): Promise<InvitePreview> {
    const found = await this.repo.findInvitePreview(hashToken(token), this.clock.now());
    if (!found) throw new AppError('INVITE_INVALID');
    return found;
  }

  listInvites(workspaceId: string, role: Role): Promise<PendingInvite[]> {
    requireOwner(role);
    return this.repo.listPending(workspaceId, this.clock.now());
  }

  async revokeInvite(workspaceId: string, role: Role, id: string): Promise<void> {
    requireOwner(role);
    if (!(await this.repo.revoke(workspaceId, id, this.clock.now())))
      throw new AppError('NOT_FOUND');
  }

  async accept(userId: string, token: string) {
    const tokenHash = hashToken(token);
    const workspaceId = await this.repo.findInviteWorkspace(tokenHash);
    if (!workspaceId) throw new AppError('INVITE_INVALID');
    return this.repo.accept(workspaceId, tokenHash, userId, this.clock.now());
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
    await this.checkTeachers(workspaceId, ids);
    await this.repo.replaceScopes(workspaceId, memberId, ids);
  }

  /** Every id an active owner or teacher here (owners teach too), else SCOPE_TEACHER_INVALID. */
  private async checkTeachers(workspaceId: string, ids: string[]) {
    const teachers = (await this.repo.roles(workspaceId, ids)).filter(
      (m) => m.role !== 'assistant',
    );
    if (teachers.length !== ids.length) throw new AppError('SCOPE_TEACHER_INVALID');
  }

  /** Owner only: a new role, or removal (their groups stay, flagged teacherRemoved). */
  async update(
    workspaceId: string,
    role: Role,
    memberId: string,
    body: UpdateMemberRequest,
  ): Promise<Member> {
    requireOwner(role);
    const result = await this.repo.update(
      workspaceId,
      memberId,
      body.role ? { role: body.role } : { removedAt: this.clock.now() },
    );
    if (result === 'not_found') throw new AppError('NOT_FOUND');
    if (result === 'last_owner') throw new AppError('LAST_OWNER');
    if (typeof result === 'object')
      throw new AppError('MEMBER_TEACHES_GROUPS', { count: result.teaching });
    const [member] = await this.repo.list(workspaceId, memberId);
    return member!;
  }
}
