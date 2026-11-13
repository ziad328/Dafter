import * as z from 'zod';
import { createDocument } from 'zod-openapi';
import { authResponse, loginRequest, me, registerRequest } from './auth.js';
import { errorResponse } from './errors.js';
import {
  createGroupRequest,
  curriculumList,
  group,
  groupList,
  updateGroupRequest,
} from './groups.js';
import { healthResponse } from './health.js';
import { listSessionsQuery, moveSessionRequest, session, sessionList } from './sessions.js';
import {
  createInviteRequest,
  createWorkspaceRequest,
  invite,
  memberList,
  setScopesRequest,
  workspace,
  workspaceList,
} from './workspaces.js';

const json = <T>(schema: T) => ({ 'application/json': { schema } });

/** Any non-2xx response: { code, details }. */
const errors = { default: { description: 'Error', content: json(errorResponse) } };

const authPost = (operationId: string, body?: unknown, status = 200) => ({
  post: {
    operationId,
    tags: ['auth'],
    ...(body ? { requestBody: { required: true, content: json(body) } } : {}),
    responses: {
      [status]: { description: 'Signed in; sets the refresh cookie', content: json(authResponse) },
      ...errors,
    },
  },
});

const curriculumGet = (operationId: string, description: string) => ({
  get: {
    operationId,
    tags: ['curriculum'],
    security: [{ bearer: [] }],
    responses: { 200: { description, content: json(curriculumList) }, ...errors },
  },
});

/** The OpenAPI document; paths are added here as each endpoint's contract is written. */
export function buildOpenApi() {
  return createDocument({
    openapi: '3.1.0',
    info: { title: 'Dafter API', version: '0.1.0' },
    paths: {
      '/health': {
        get: {
          operationId: 'getHealth',
          tags: ['system'],
          responses: {
            200: { description: 'The API is up', content: json(healthResponse) },
            ...errors,
          },
        },
      },
      '/api/v1/auth/register': authPost('register', registerRequest, 201),
      '/api/v1/auth/login': authPost('login', loginRequest),
      // Reads the httpOnly refresh cookie, rotates it.
      '/api/v1/auth/refresh': authPost('refresh'),
      '/api/v1/auth/logout': {
        post: {
          operationId: 'logout',
          tags: ['auth'],
          responses: { 204: { description: 'Refresh family revoked, cookie cleared' }, ...errors },
        },
      },
      '/api/v1/me': {
        get: {
          operationId: 'getMe',
          tags: ['auth'],
          security: [{ bearer: [] }],
          responses: { 200: { description: 'The signed-in user', content: json(me) }, ...errors },
        },
      },
      '/api/v1/workspaces': {
        post: {
          operationId: 'createWorkspace',
          tags: ['workspaces'],
          security: [{ bearer: [] }],
          requestBody: { required: true, content: json(createWorkspaceRequest) },
          responses: {
            201: { description: 'Created; the caller is its owner', content: json(workspace) },
            ...errors,
          },
        },
        get: {
          operationId: 'listWorkspaces',
          tags: ['workspaces'],
          security: [{ bearer: [] }],
          responses: {
            200: { description: "The caller's workspaces", content: json(workspaceList) },
            ...errors,
          },
        },
      },
      '/api/v1/workspaces/current': {
        get: {
          operationId: 'getCurrentWorkspace',
          tags: ['workspaces'],
          // X-Workspace-Id is sent on every tenant call by the base query, so it is not a per-endpoint arg.
          description: 'The workspace named by the X-Workspace-Id header (the switch target).',
          security: [{ bearer: [] }],
          responses: {
            200: { description: 'The active workspace', content: json(workspace) },
            ...errors,
          },
        },
      },
      '/api/v1/invites': {
        post: {
          operationId: 'createInvite',
          tags: ['members'],
          description: 'Owner only. Single use, valid for 72 hours.',
          security: [{ bearer: [] }],
          requestBody: { required: true, content: json(createInviteRequest) },
          responses: {
            201: { description: 'The invite; its token is shown only here', content: json(invite) },
            ...errors,
          },
        },
      },
      '/api/v1/invites/{token}/accept': {
        post: {
          operationId: 'acceptInvite',
          tags: ['members'],
          description:
            'Joins the signed-in user to the inviting workspace. Needs no X-Workspace-Id.',
          security: [{ bearer: [] }],
          requestParams: { path: z.object({ token: z.string() }) },
          responses: {
            200: { description: 'The joined workspace', content: json(workspace) },
            ...errors,
          },
        },
      },
      '/api/v1/members': {
        get: {
          operationId: 'listMembers',
          tags: ['members'],
          security: [{ bearer: [] }],
          responses: {
            200: { description: 'Members of the active workspace', content: json(memberList) },
            ...errors,
          },
        },
      },
      '/api/v1/members/{id}/scopes': {
        put: {
          operationId: 'setAssistantScopes',
          tags: ['members'],
          description: 'Owner only. Replaces the teachers an assistant works for.',
          security: [{ bearer: [] }],
          requestParams: { path: z.object({ id: z.uuid() }) },
          requestBody: { required: true, content: json(setScopesRequest) },
          responses: { 204: { description: 'Scopes replaced' }, ...errors },
        },
      },
      '/api/v1/subjects': curriculumGet('listSubjects', 'Subjects of the active workspace'),
      '/api/v1/grade-levels': curriculumGet(
        'listGradeLevels',
        'Grade levels of the active workspace',
      ),
      '/api/v1/groups': {
        get: {
          operationId: 'listGroups',
          tags: ['groups'],
          description: 'Owner: all groups. Teacher: own groups. Assistant: assigned teachers.',
          security: [{ bearer: [] }],
          responses: {
            200: { description: 'Groups the caller can see', content: json(groupList) },
            ...errors,
          },
        },
        post: {
          operationId: 'createGroup',
          tags: ['groups'],
          description: 'Owner or teacher. A teacher always creates their own group.',
          security: [{ bearer: [] }],
          requestBody: { required: true, content: json(createGroupRequest) },
          responses: { 201: { description: 'Created', content: json(group) }, ...errors },
        },
      },
      '/api/v1/groups/{id}': {
        get: {
          operationId: 'getGroup',
          tags: ['groups'],
          security: [{ bearer: [] }],
          requestParams: { path: z.object({ id: z.uuid() }) },
          responses: { 200: { description: 'The group', content: json(group) }, ...errors },
        },
        patch: {
          operationId: 'updateGroup',
          tags: ['groups'],
          description: 'Owner, or the teacher of the group. Only the owner reassigns the teacher.',
          security: [{ bearer: [] }],
          requestParams: { path: z.object({ id: z.uuid() }) },
          requestBody: { required: true, content: json(updateGroupRequest) },
          responses: { 200: { description: 'Updated', content: json(group) }, ...errors },
        },
      },
      '/api/v1/sessions': {
        get: {
          operationId: 'listSessions',
          tags: ['sessions'],
          description: 'Sessions between two local dates (inclusive), same visibility as groups.',
          security: [{ bearer: [] }],
          requestParams: { query: listSessionsQuery },
          responses: {
            200: { description: 'Sessions the caller can see', content: json(sessionList) },
            ...errors,
          },
        },
      },
      '/api/v1/sessions/{id}': {
        patch: {
          operationId: 'moveSession',
          tags: ['sessions'],
          description: 'Owner, or the teacher of the group. Only a scheduled session moves.',
          security: [{ bearer: [] }],
          requestParams: { path: z.object({ id: z.uuid() }) },
          requestBody: { required: true, content: json(moveSessionRequest) },
          responses: { 200: { description: 'Moved', content: json(session) }, ...errors },
        },
      },
      '/api/v1/sessions/{id}/cancel': {
        post: {
          operationId: 'cancelSession',
          tags: ['sessions'],
          description: 'Owner, or the teacher of the group. Only a scheduled session is cancelled.',
          security: [{ bearer: [] }],
          requestParams: { path: z.object({ id: z.uuid() }) },
          responses: { 200: { description: 'Cancelled', content: json(session) }, ...errors },
        },
      },
    },
    components: { securitySchemes: { bearer: { type: 'http', scheme: 'bearer' } } },
  });
}
