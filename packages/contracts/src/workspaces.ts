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

// Owners are never invited; an owner can make a member an owner later (PATCH /members/:id).
export const createInviteRequest = z
  .object({
    role: z.enum(['teacher', 'assistant']),
    // Assistant invites only: the teachers they will work for, set when they accept.
    teacherMembershipIds: z.array(z.uuid()).max(50).optional(),
  })
  .refine((r) => r.role === 'assistant' || !r.teacherMembershipIds?.length, {
    path: ['teacherMembershipIds'],
    message: 'SCOPES_FOR_ASSISTANTS_ONLY',
  })
  .meta({ id: 'CreateInviteRequest' });

export const invite = z
  .object({
    id: z.uuid(),
    role: z.enum(['teacher', 'assistant']),
    // Returned once; only its hash is stored. The web app builds the /invite/<token> link.
    token: z.string(),
    expiresAt: z.iso.datetime(),
    teacherMembershipIds: z.array(z.uuid()),
  })
  .meta({ id: 'Invite' });

/** Owner-issued password reset link for a staff member: shown once, opens /reset/<token>. */
export const staffResetLink = z
  .object({ token: z.string(), expiresAt: z.iso.datetime() })
  .meta({ id: 'StaffResetLink' });

export type StaffResetLink = z.infer<typeof staffResetLink>;

export const member = z
  .object({
    id: z.uuid(),
    userId: z.uuid(),
    name: z.string(),
    phone: z.string().nullable(),
    role: z.enum(['owner', 'teacher', 'assistant']),
    // Always active in the list; removed in the answer to a PATCH that removed them.
    status: z.enum(['active', 'removed']),
    // For assistants: the teacher memberships they work for. Empty for other roles.
    teacherMembershipIds: z.array(z.uuid()),
  })
  .meta({ id: 'Member' });

export const memberList = z.array(member).meta({ id: 'MemberList' });

/** Change a member's role, or remove them from the workspace (owner only). */
export const updateMemberRequest = z
  .object({
    role: z.enum(['owner', 'teacher', 'assistant']).optional(),
    status: z.literal('removed').optional(),
  })
  .refine((r) => (r.role === undefined) !== (r.status === undefined), {
    message: 'ROLE_OR_REMOVE',
  })
  .meta({ id: 'UpdateMemberRequest' });

export const setScopesRequest = z
  .object({ teacherMembershipIds: z.array(z.uuid()).max(50) })
  .meta({ id: 'SetScopesRequest' });

export type CreateInviteRequest = z.infer<typeof createInviteRequest>;
export type Invite = z.infer<typeof invite>;
export type Member = z.infer<typeof member>;
export type SetScopesRequest = z.infer<typeof setScopesRequest>;
export type UpdateMemberRequest = z.infer<typeof updateMemberRequest>;
