import { createDocument } from 'zod-openapi';
import { authResponse, loginRequest, me, registerRequest } from './auth.js';
import { errorResponse } from './errors.js';
import { healthResponse } from './health.js';
import { createWorkspaceRequest, workspace, workspaceList } from './workspaces.js';

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
    },
    components: { securitySchemes: { bearer: { type: 'http', scheme: 'bearer' } } },
  });
}
