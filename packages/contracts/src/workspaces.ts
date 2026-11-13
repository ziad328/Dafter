import * as z from 'zod';

/** Tenant routes read the active workspace from this header; the web app sets it on every call. */
export const WORKSPACE_HEADER = 'x-workspace-id';

export const createWorkspaceRequest = z
  .object({
    type: z.enum(['center', 'independent']),
    nameAr: z.string().trim().min(2).max(100),
    nameEn: z.string().trim().min(2).max(100).optional(),
  })
  .meta({ id: 'CreateWorkspaceRequest' });

export const workspace = z
  .object({
    id: z.uuid(),
    type: z.enum(['center', 'independent']),
    nameAr: z.string(),
    nameEn: z.string().nullable(),
    timezone: z.string(),
    // The caller's role in this workspace.
    role: z.enum(['owner', 'teacher', 'assistant']),
  })
  .meta({ id: 'Workspace' });

export const workspaceList = z.array(workspace).meta({ id: 'WorkspaceList' });

export type CreateWorkspaceRequest = z.infer<typeof createWorkspaceRequest>;
export type Workspace = z.infer<typeof workspace>;

// Owners are never invited: a workspace has exactly the owner who created it.
export const createInviteRequest = z
  .object({ role: z.enum(['teacher', 'assistant']) })
  .meta({ id: 'CreateInviteRequest' });

export const invite = z
  .object({
    id: z.uuid(),
    role: z.enum(['teacher', 'assistant']),
    // Returned once; only its hash is stored. The web app builds the /invite/<token> link.
    token: z.string(),
    expiresAt: z.iso.datetime(),
  })
  .meta({ id: 'Invite' });

export const member = z
  .object({
    id: z.uuid(),
    userId: z.uuid(),
    name: z.string(),
    phone: z.string().nullable(),
    role: z.enum(['owner', 'teacher', 'assistant']),
    // For assistants: the teacher memberships they work for. Empty for other roles.
    teacherMembershipIds: z.array(z.uuid()),
  })
  .meta({ id: 'Member' });

export const memberList = z.array(member).meta({ id: 'MemberList' });

export const setScopesRequest = z
  .object({ teacherMembershipIds: z.array(z.uuid()).max(50) })
  .meta({ id: 'SetScopesRequest' });

export type CreateInviteRequest = z.infer<typeof createInviteRequest>;
export type Invite = z.infer<typeof invite>;
export type Member = z.infer<typeof member>;
export type SetScopesRequest = z.infer<typeof setScopesRequest>;
