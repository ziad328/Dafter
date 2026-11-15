import { Injectable } from '@nestjs/common';
import { and, asc, eq } from 'drizzle-orm';
import type { CreateWorkspaceRequest, Workspace } from '@dafter/contracts';
import { insertCurriculum, memberships, workspaces } from '@dafter/db';
import { TenantRepository } from '../tenant.repository.js';

type Role = Workspace['role'];

export const workspaceColumns = {
  id: workspaces.id,
  type: workspaces.type,
  nameAr: workspaces.nameAr,
  nameEn: workspaces.nameEn,
  timezone: workspaces.timezone,
};

@Injectable()
export class WorkspacesRepository extends TenantRepository {
  /** The new workspace, its owner membership and its curriculum, written under RLS for the new id. */
  create(id: string, userId: string, body: CreateWorkspaceRequest): Promise<Workspace> {
    return this.inTenant(id, async (tx) => {
      const [row] = await tx
        .insert(workspaces)
        .values({ id, type: body.type, nameAr: body.nameAr, nameEn: body.nameEn })
        .returning(workspaceColumns);
      await tx.insert(memberships).values({ workspaceId: id, userId, role: 'owner' });
      await insertCurriculum(tx, id);
      return { ...row!, role: 'owner' };
    });
  }

  async findMembership(
    workspaceId: string,
    userId: string,
  ): Promise<{ id: string; role: Role } | undefined> {
    const [row] = await this.inTenant(workspaceId, (tx) =>
      tx
        .select({ id: memberships.id, role: memberships.role })
        .from(memberships)
        .where(
          and(
            eq(memberships.workspaceId, workspaceId),
            eq(memberships.userId, userId),
            // A removed member is not a member: the same 404 as a stranger, on their next request.
            eq(memberships.status, 'active'),
          ),
        ),
    );
    return row;
  }

  async find(workspaceId: string) {
    const [row] = await this.inTenant(workspaceId, (tx) =>
      tx.select(workspaceColumns).from(workspaces).where(eq(workspaces.id, workspaceId)),
    );
    return row;
  }

  /**
   * The one cross-tenant read: the workspace switcher needs every workspace the user belongs to.
   * Runs as the owner (no RLS), so the user_id filter is the only guard; keep it that way.
   */
  listForUser(userId: string): Promise<Workspace[]> {
    return this.db
      .select({ ...workspaceColumns, role: memberships.role })
      .from(memberships)
      .innerJoin(workspaces, eq(workspaces.id, memberships.workspaceId))
      .where(and(eq(memberships.userId, userId), eq(memberships.status, 'active')))
      .orderBy(asc(memberships.createdAt));
  }
}
