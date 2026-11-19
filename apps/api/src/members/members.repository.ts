import { Injectable } from '@nestjs/common';
import { and, asc, desc, eq, gt, inArray, isNull, ne, or, sql } from 'drizzle-orm';
import type { Invite, InvitePreview, Member, PendingInvite, Workspace } from '@dafter/contracts';
import {
  assistantScopes,
  groups,
  invites,
  memberships,
  passwordResets,
  type Tx,
  users,
  workspaces,
} from '@dafter/db';
import { AppError } from '../errors.js';
import { TenantRepository } from '../tenant.repository.js';
import { workspaceColumns } from '../workspaces/workspaces.repository.js';

type Role = Workspace['role'];

@Injectable()
export class MembersRepository extends TenantRepository {
  async createInvite(
    workspaceId: string,
    createdByMembershipId: string,
    role: Invite['role'],
    teacherMembershipIds: string[],
    tokenHash: string,
    expiresAt: Date,
  ) {
    const [row] = await this.inTenant(workspaceId, (tx) =>
      tx
        .insert(invites)
        .values({
          workspaceId,
          createdByMembershipId,
          role,
          teacherMembershipIds,
          tokenHash,
          expiresAt,
        })
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
        .where(
          and(
            eq(memberships.workspaceId, workspaceId),
            eq(memberships.id, memberId),
            eq(memberships.status, 'active'),
          ),
        ),
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

  /**
   * The invite page's preview, before sign-in: like findInviteWorkspace, a read by token hash as
   * the owner (no RLS), and only for an invite that can still be accepted.
   */
  async findInvitePreview(tokenHash: string, now: Date): Promise<InvitePreview | undefined> {
    const [row] = await this.db
      .select({
        workspaceNameAr: workspaces.nameAr,
        workspaceNameEn: workspaces.nameEn,
        workspaceType: workspaces.type,
        role: invites.role,
      })
      .from(invites)
      .innerJoin(workspaces, eq(workspaces.id, invites.workspaceId))
      .where(
        and(eq(invites.tokenHash, tokenHash), isNull(invites.usedAt), gt(invites.expiresAt, now)),
      );
    return row && { ...row, role: row.role as InvitePreview['role'] };
  }

  /** Unused, unexpired invites of this workspace, newest first. */
  listPending(workspaceId: string, now: Date): Promise<PendingInvite[]> {
    return this.inTenant(workspaceId, async (tx) => {
      const rows = await tx
        .select({
          id: invites.id,
          role: invites.role,
          expiresAt: invites.expiresAt,
          createdAt: invites.createdAt,
          invitedBy: users.name,
        })
        .from(invites)
        .leftJoin(
          memberships,
          and(
            eq(memberships.workspaceId, invites.workspaceId),
            eq(memberships.id, invites.createdByMembershipId),
          ),
        )
        .leftJoin(users, eq(users.id, memberships.userId))
        .where(
          and(
            eq(invites.workspaceId, workspaceId),
            isNull(invites.usedAt),
            gt(invites.expiresAt, now),
          ),
        )
        .orderBy(desc(invites.createdAt));
      return rows.map((r) => ({
        id: r.id,
        role: r.role as PendingInvite['role'],
        expiresAt: r.expiresAt.toISOString(),
        createdAt: r.createdAt.toISOString(),
        invitedBy: r.invitedBy,
      }));
    });
  }

  /**
   * Revoke = expire now: accept already refuses an expired invite, and the row stays for the
   * audit log. False when there is no pending invite with this id here.
   */
  revoke(workspaceId: string, id: string, now: Date): Promise<boolean> {
    return this.inTenant(workspaceId, async (tx) => {
      const rows = await tx
        .update(invites)
        .set({ expiresAt: now })
        .where(
          and(
            eq(invites.workspaceId, workspaceId),
            eq(invites.id, id),
            isNull(invites.usedAt),
            gt(invites.expiresAt, now),
          ),
        )
        .returning({ id: invites.id });
      return rows.length > 0;
    });
  }

  async findInviteWorkspace(tokenHash: string): Promise<string | undefined> {
    const [row] = await this.db
      .select({ workspaceId: invites.workspaceId })
      .from(invites)
      .where(eq(invites.tokenHash, tokenHash));
    return row?.workspaceId;
  }

  /**
   * One transaction: consume the invite, add the membership (or re-activate a removed one), write
   * an assistant's teachers, and read the workspace. The conditional UPDATE is the single-use
   * check: of two concurrent accepts, only one gets a row back. Teachers removed since the invite
   * was made are skipped.
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
        .returning({
          id: invites.id,
          role: invites.role,
          teacherMembershipIds: invites.teacherMembershipIds,
        });
      if (!used) throw new AppError('INVITE_INVALID');
      const [joined] = await tx
        .insert(memberships)
        .values({ workspaceId, userId, role: used.role })
        .onConflictDoUpdate({
          target: [memberships.workspaceId, memberships.userId],
          set: { role: used.role, status: 'active', removedAt: null },
          // A current member keeps their role; only a removed one comes back.
          setWhere: eq(memberships.status, 'removed'),
        })
        .returning({ id: memberships.id, role: memberships.role });
      // Thrown inside the transaction so the invite stays unused for the person it was meant for.
      if (!joined) throw new AppError('ALREADY_MEMBER');
      if (used.role === 'assistant') {
        const teachers = await this.activeTeachers(tx, workspaceId, used.teacherMembershipIds);
        await this.writeScopes(tx, workspaceId, joined.id, teachers);
      }
      const [ws] = await tx
        .select(workspaceColumns)
        .from(workspaces)
        .where(eq(workspaces.id, workspaceId));
      const workspace: Workspace = { ...ws!, role: joined.role };
      return { inviteId: used.id, workspace };
    });
  }

  /** The active members; with `id`, that one member whatever their status (after a PATCH). */
  list(workspaceId: string, id?: string): Promise<Member[]> {
    return this.inTenant(workspaceId, async (tx) => {
      const rows = await tx
        .select({
          id: memberships.id,
          userId: memberships.userId,
          name: users.name,
          phone: users.phone,
          role: memberships.role,
          status: memberships.status,
        })
        .from(memberships)
        .innerJoin(users, eq(users.id, memberships.userId))
        .where(
          and(
            eq(memberships.workspaceId, workspaceId),
            id ? eq(memberships.id, id) : eq(memberships.status, 'active'),
          ),
        )
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

  /** Roles of the given active memberships here; ids from elsewhere (or removed) are missing. */
  roles(workspaceId: string, ids: string[]): Promise<{ id: string; role: Role }[]> {
    if (!ids.length) return Promise.resolve([]);
    return this.inTenant(workspaceId, (tx) =>
      tx
        .select({ id: memberships.id, role: memberships.role })
        .from(memberships)
        .where(
          and(
            eq(memberships.workspaceId, workspaceId),
            inArray(memberships.id, ids),
            eq(memberships.status, 'active'),
          ),
        ),
    );
  }

  /**
   * Checks and writes in one transaction, after the same lock as `update` (the workspace's active
   * owner rows): a teacher removed or demoted at the same moment is either gone before the check
   * (SCOPE_TEACHER_INVALID) or removed after the write, and then their scopes go with them.
   */
  replaceScopes(
    workspaceId: string,
    membershipId: string,
    teacherIds: string[],
  ): Promise<'not_found' | 'not_assistant' | 'invalid_teacher' | 'ok'> {
    return this.inTenant(workspaceId, async (tx) => {
      await this.lockOwners(tx, workspaceId);
      const [member] = await tx
        .select({ role: memberships.role })
        .from(memberships)
        .where(
          and(
            eq(memberships.workspaceId, workspaceId),
            eq(memberships.id, membershipId),
            eq(memberships.status, 'active'),
          ),
        );
      if (!member) return 'not_found';
      if (member.role !== 'assistant') return 'not_assistant';
      if ((await this.activeTeachers(tx, workspaceId, teacherIds)).length !== teacherIds.length)
        return 'invalid_teacher';
      await this.writeScopes(tx, workspaceId, membershipId, teacherIds);
      return 'ok';
    });
  }

  /**
   * Every change to who is in the workspace and what they see starts here, so two of them run one
   * after the other and never lock each other's rows in opposite orders.
   */
  private lockOwners(tx: Tx, workspaceId: string) {
    return tx
      .select({ id: memberships.id })
      .from(memberships)
      .where(
        and(
          eq(memberships.workspaceId, workspaceId),
          eq(memberships.role, 'owner'),
          eq(memberships.status, 'active'),
        ),
      )
      .for('update');
  }

  /** The given ids that are active owners or teachers here (owners teach too). */
  private async activeTeachers(tx: Tx, workspaceId: string, ids: string[]) {
    if (!ids.length) return [];
    const rows = await tx
      .select({ id: memberships.id })
      .from(memberships)
      .where(
        and(
          eq(memberships.workspaceId, workspaceId),
          inArray(memberships.id, ids),
          ne(memberships.role, 'assistant'),
          eq(memberships.status, 'active'),
        ),
      )
      // A removal or demotion of these teachers waits for this accept to commit.
      .for('share');
    return rows.map((r) => r.id);
  }

  private async writeScopes(
    tx: Tx,
    workspaceId: string,
    membershipId: string,
    teacherIds: string[],
  ) {
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
  }

  /**
   * Change a role or remove a member, in one transaction. The workspace's active owner rows are
   * locked first, so two owners demoting or removing each other run one after the other and the
   * second sees one owner left (LAST_OWNER). Scopes follow the role: an assistant's own scopes go
   * when they stop being one, and scopes naming them go when they stop teaching (or leave).
   */
  update(
    workspaceId: string,
    memberId: string,
    change: { role: Role } | { removedAt: Date },
  ): Promise<'not_found' | 'last_owner' | { teaching: number } | Role> {
    return this.inTenant(workspaceId, async (tx) => {
      const owners = await this.lockOwners(tx, workspaceId);
      const [member] = await tx
        .select({ role: memberships.role })
        .from(memberships)
        .where(
          and(
            eq(memberships.workspaceId, workspaceId),
            eq(memberships.id, memberId),
            eq(memberships.status, 'active'),
          ),
        )
        .for('update');
      if (!member) return 'not_found';
      const role = 'role' in change ? change.role : undefined;
      const leavesOwners = member.role === 'owner' && role !== 'owner';
      if (leavesOwners && owners.length === 1) return 'last_owner';
      if (role === 'assistant' && member.role !== 'assistant') {
        const [{ count }] = (await tx
          .select({ count: sql<number>`count(*)::int` })
          .from(groups)
          .where(
            and(
              eq(groups.workspaceId, workspaceId),
              eq(groups.teacherMembershipId, memberId),
              eq(groups.status, 'active'),
            ),
          )) as [{ count: number }];
        if (count > 0) return { teaching: count };
      }
      await tx
        .update(memberships)
        .set(
          role
            ? { role }
            : { status: 'removed', removedAt: (change as { removedAt: Date }).removedAt },
        )
        .where(and(eq(memberships.workspaceId, workspaceId), eq(memberships.id, memberId)));
      // Removed: both directions go. New role: an assistant keeps their own scopes and loses the
      // ones naming them as a teacher; an owner or teacher the other way round.
      const keepOwn = role === 'assistant';
      const keepNamed = role !== undefined && role !== 'assistant';
      await tx
        .delete(assistantScopes)
        .where(
          and(
            eq(assistantScopes.workspaceId, workspaceId),
            or(
              keepOwn ? sql`false` : eq(assistantScopes.membershipId, memberId),
              keepNamed ? sql`false` : eq(assistantScopes.teacherMembershipId, memberId),
            ),
          ),
        );
      return role ?? member.role;
    });
  }
}
