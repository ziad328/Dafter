import { Injectable } from '@nestjs/common';
import { and, asc, eq, gt, inArray, isNull, sql } from 'drizzle-orm';
import type { Invite, Member, Workspace } from '@dafter/contracts';
import { assistantScopes, invites, memberships, passwordResets, users } from '@dafter/db';
import { AppError } from '../errors.js';
import { TenantRepository } from '../tenant.repository.js';

type Role = Workspace['role'];

@Injectable()
export class MembersRepository extends TenantRepository {
  async createInvite(
    workspaceId: string,
    role: Invite['role'],
    tokenHash: string,
    expiresAt: Date,
  ) {
    const [row] = await this.inTenant(workspaceId, (tx) =>
      tx
        .insert(invites)
        .values({ workspaceId, role, tokenHash, expiresAt })
        .returning({ id: invites.id }),
    );
    return row!;
  }

  /**
   * The second cross-tenant read: the invitee is not a member yet, so RLS would hide the invite.
   * Runs as the owner (no RLS); the token hash is the only filter, so keep it that way.
   */
  /**
   * Stores an owner-issued reset for a member whose account lives in this workspace alone:
   * a teacher or assistant with a password, no other membership and no student record anywhere.
   * The third cross-tenant read (other workspaces' rows decide it), as the owner without RLS.
   */
  async issueReset(
    workspaceId: string,
    memberId: string,
    tokenHash: string,
    expiresAt: Date,
  ): Promise<'ok' | 'not_found' | 'not_allowed'> {
    const [member] = await this.inTenant(workspaceId, (tx) =>
      tx
        .select({ userId: memberships.userId, role: memberships.role })
        .from(memberships)
        .where(and(eq(memberships.workspaceId, workspaceId), eq(memberships.id, memberId))),
    );
    if (!member) return 'not_found';
    if (member.role === 'owner') return 'not_allowed';
    const { rows } = await this.db.execute<{
      has_password: boolean;
      memberships: number;
      student: boolean;
    }>(sql`
      select u.password_hash is not null as has_password,
        (select count(*) from memberships m where m.user_id = u.id)::int as memberships,
        exists (select 1 from students s where s.user_id = u.id) as student
      from users u where u.id = ${member.userId}`);
    const user = rows[0]!;
    if (!user.has_password || user.memberships > 1 || user.student) return 'not_allowed';
    await this.db.insert(passwordResets).values({ userId: member.userId, tokenHash, expiresAt });
    return 'ok';
  }

  async findInviteWorkspace(tokenHash: string): Promise<string | undefined> {
    const [row] = await this.db
      .select({ workspaceId: invites.workspaceId })
      .from(invites)
      .where(eq(invites.tokenHash, tokenHash));
    return row?.workspaceId;
  }

  /**
   * Consumes the invite and adds the membership in one transaction. The conditional UPDATE is the
   * single-use check: of two concurrent accepts, only one gets a row back.
   */
  accept(workspaceId: string, tokenHash: string, userId: string, now: Date) {
    return this.inTenant(workspaceId, async (tx) => {
      const [used] = await tx
        .update(invites)
        .set({ usedAt: now })
        .where(
          and(
            eq(invites.tokenHash, tokenHash),
            eq(invites.workspaceId, workspaceId),
            isNull(invites.usedAt),
            gt(invites.expiresAt, now),
          ),
        )
        .returning({ id: invites.id, role: invites.role });
      if (!used) throw new AppError('INVITE_INVALID');
      const [joined] = await tx
        .insert(memberships)
        .values({ workspaceId, userId, role: used.role })
        .onConflictDoNothing()
        .returning({ role: memberships.role });
      // Thrown inside the transaction so the invite stays unused for the person it was meant for.
      if (!joined) throw new AppError('ALREADY_MEMBER');
      return { inviteId: used.id, role: joined.role };
    });
  }

  list(workspaceId: string): Promise<Member[]> {
    return this.inTenant(workspaceId, async (tx) => {
      const rows = await tx
        .select({
          id: memberships.id,
          userId: memberships.userId,
          name: users.name,
          phone: users.phone,
          role: memberships.role,
        })
        .from(memberships)
        .innerJoin(users, eq(users.id, memberships.userId))
        .where(eq(memberships.workspaceId, workspaceId))
        .orderBy(asc(memberships.createdAt));
      const scopes = await tx
        .select()
        .from(assistantScopes)
        .where(eq(assistantScopes.workspaceId, workspaceId));
      return rows.map((r) => ({
        ...r,
        teacherMembershipIds: scopes
          .filter((s) => s.membershipId === r.id)
          .map((s) => s.teacherMembershipId),
      }));
    });
  }

  /** Roles of the given memberships in this workspace; ids from elsewhere are simply missing. */
  roles(workspaceId: string, ids: string[]): Promise<{ id: string; role: Role }[]> {
    if (!ids.length) return Promise.resolve([]);
    return this.inTenant(workspaceId, (tx) =>
      tx
        .select({ id: memberships.id, role: memberships.role })
        .from(memberships)
        .where(and(eq(memberships.workspaceId, workspaceId), inArray(memberships.id, ids))),
    );
  }

  replaceScopes(workspaceId: string, membershipId: string, teacherIds: string[]) {
    return this.inTenant(workspaceId, async (tx) => {
      await tx
        .delete(assistantScopes)
        .where(
          and(
            eq(assistantScopes.workspaceId, workspaceId),
            eq(assistantScopes.membershipId, membershipId),
          ),
        );
      if (teacherIds.length)
        await tx.insert(assistantScopes).values(
          teacherIds.map((teacherMembershipId) => ({
            workspaceId,
            membershipId,
            teacherMembershipId,
          })),
        );
    });
  }
}
