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
import { createEnrollmentRequest, enrollment, enrollmentList } from './enrollments.js';
import { healthResponse } from './health.js';
import {
  bindDeviceRequest,
  device,
  otpRequest,
  otpVerifyRequest,
  studentInvite,
} from './student-auth.js';
import {
  createStudentRequest,
  listStudentsQuery,
  student,
  studentList,
  updateStudentRequest,
} from './students.js';
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
      '/api/v1/students': {
        get: {
          operationId: 'listStudents',
          tags: ['students'],
          description: 'Every staff role. Search by normalized name or phone prefix; first 50.',
          security: [{ bearer: [] }],
          requestParams: { query: listStudentsQuery },
          responses: { 200: { description: 'Students', content: json(studentList) }, ...errors },
        },
        post: {
          operationId: 'createStudent',
          tags: ['students'],
          description: 'Every staff role. The guardian is reused when the phone already exists.',
          security: [{ bearer: [] }],
          requestBody: { required: true, content: json(createStudentRequest) },
          responses: { 201: { description: 'Created', content: json(student) }, ...errors },
        },
      },
      '/api/v1/students/{id}': {
        get: {
          operationId: 'getStudent',
          tags: ['students'],
          security: [{ bearer: [] }],
          requestParams: { path: z.object({ id: z.uuid() }) },
          responses: { 200: { description: 'The student', content: json(student) }, ...errors },
        },
        patch: {
          operationId: 'updateStudent',
          tags: ['students'],
          description: 'Every staff role. Archive with status; students are never deleted.',
          security: [{ bearer: [] }],
          requestParams: { path: z.object({ id: z.uuid() }) },
          requestBody: { required: true, content: json(updateStudentRequest) },
          responses: { 200: { description: 'Updated', content: json(student) }, ...errors },
        },
      },
      '/api/v1/students/{id}/enrollments': {
        get: {
          operationId: 'listEnrollments',
          tags: ['students'],
          description: 'Every staff role. Active and past enrollments.',
          security: [{ bearer: [] }],
          requestParams: { path: z.object({ id: z.uuid() }) },
          responses: {
            200: { description: 'Enrollments', content: json(enrollmentList) },
            ...errors,
          },
        },
        post: {
          operationId: 'createEnrollment',
          tags: ['students'],
          description: 'Into a group the caller can see (same scope as GET /groups).',
          security: [{ bearer: [] }],
          requestParams: { path: z.object({ id: z.uuid() }) },
          requestBody: { required: true, content: json(createEnrollmentRequest) },
          responses: { 201: { description: 'Enrolled', content: json(enrollment) }, ...errors },
        },
      },
      '/api/v1/students/{id}/enrollments/{enrollmentId}': {
        delete: {
          operationId: 'leaveEnrollment',
          tags: ['students'],
          description: 'Marks the enrollment as left; the row stays for history.',
          security: [{ bearer: [] }],
          requestParams: { path: z.object({ id: z.uuid(), enrollmentId: z.uuid() }) },
          responses: { 200: { description: 'Left', content: json(enrollment) }, ...errors },
        },
      },
      '/api/v1/students/{id}/invite': {
        post: {
          operationId: 'createStudentInvite',
          tags: ['students'],
          description: 'Single-use app activation link, 72 hours. Replaces older unused links.',
          security: [{ bearer: [] }],
          requestParams: { path: z.object({ id: z.uuid() }) },
          responses: {
            201: { description: 'The token is shown only here', content: json(studentInvite) },
            ...errors,
          },
        },
      },
      '/api/v1/students/{id}/device': {
        delete: {
          operationId: 'resetStudentDevice',
          tags: ['students'],
          description: 'Unbinds the phone and signs the student out everywhere. Audited.',
          security: [{ bearer: [] }],
          requestParams: { path: z.object({ id: z.uuid() }) },
          responses: { 204: { description: 'No active phone' }, ...errors },
        },
      },
      '/api/v1/auth/otp/request': {
        post: {
          operationId: 'requestOtp',
          tags: ['student-auth'],
          description: 'Emails a 6-digit code. Always 204, so emails cannot be probed.',
          requestBody: { required: true, content: json(otpRequest) },
          responses: { 204: { description: 'Sent if the email can sign in' }, ...errors },
        },
      },
      '/api/v1/auth/otp/verify': authPost('verifyOtp', otpVerifyRequest),
      '/api/v1/devices/bind': {
        post: {
          operationId: 'bindDevice',
          tags: ['student-auth'],
          description: "Binds this phone's public key to the signed-in student.",
          security: [{ bearer: [] }],
          requestBody: { required: true, content: json(bindDeviceRequest) },
          responses: { 201: { description: 'Bound', content: json(device) }, ...errors },
        },
      },
    },
    components: { securitySchemes: { bearer: { type: 'http', scheme: 'bearer' } } },
  });
}
