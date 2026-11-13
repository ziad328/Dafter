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
