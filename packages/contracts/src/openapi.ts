import * as z from 'zod';
import { createDocument } from 'zod-openapi';
import {
  authResponse,
  forgotPasswordRequest,
  loginRequest,
  me,
  registerRequest,
  resetPasswordRequest,
} from './auth.js';
import { errorResponse } from './errors.js';
import {
  createGroupRequest,
  curriculumList,
  group,
  groupList,
  updateGroupRequest,
} from './groups.js';
import { createRoomRequest, room, roomList, updateRoomRequest } from './rooms.js';
import {
  attendanceList,
  roster,
  attendanceRecord,
  checkIn,
  checkInRequest,
  markAttendanceRequest,
  openSession,
  attendanceSettings,
} from './attendance.js';
import { createEnrollmentRequest, enrollment, enrollmentList } from './enrollments.js';
import {
  createExamRequest,
  exam,
  examList,
  examSheet,
  myGrades,
  notifyExamResponse,
  saveExamResultsRequest,
  updateExamRequest,
} from './exams.js';
import { healthResponse } from './health.js';
import { createPaymentRequest, ledgerEntry, receipt, studentLedger } from './money.js';
import {
  listMessagesQuery,
  messageSettings,
  messageTrigger,
  outboxMessageList,
  sentMessageList,
} from './messages.js';
import { messageTemplateList, updateMessageTemplateRequest, messageTemplate } from './templates.js';
import { myAttendance, mySchedule } from './me.js';
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
  cashSummary,
  cashSummaryQuery,
  collectionStats,
  owingList,
  todayStats,
  trendStats,
} from './stats.js';
import {
  createInviteRequest,
  createWorkspaceRequest,
  invite,
  memberList,
  setScopesRequest,
  staffResetLink,
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
      '/api/v1/auth/password-reset': {
        post: {
          operationId: 'forgotPassword',
          tags: ['auth'],
          description:
            'Emails a single-use reset link (30 minutes) if a staff account has this email. Always 204, so it never reveals which emails have accounts. Rate limited.',
          requestBody: { required: true, content: json(forgotPasswordRequest) },
          responses: { 204: { description: 'Accepted' }, ...errors },
        },
      },
      '/api/v1/auth/password-reset/confirm': {
        post: {
          operationId: 'resetPassword',
          tags: ['auth'],
          description: 'Sets the new password and signs the user out everywhere.',
          requestBody: { required: true, content: json(resetPasswordRequest) },
          responses: { 204: { description: 'Password changed' }, ...errors },
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
      '/api/v1/me/schedule': {
        get: {
          operationId: 'getMySchedule',
          tags: ['student'],
          description:
            'Student: sessions of my active enrollments in every center, from 3 hours ago to 14 days ahead.',
          security: [{ bearer: [] }],
          responses: { 200: { description: 'My sessions', content: json(mySchedule) }, ...errors },
        },
      },
      '/api/v1/me/attendance': {
        get: {
          operationId: 'getMyAttendance',
          tags: ['student'],
          description: 'Student: my last 50 attendance records in every center, newest first.',
          security: [{ bearer: [] }],
          responses: {
            200: { description: 'My attendance', content: json(myAttendance) },
            ...errors,
          },
        },
      },
      '/api/v1/me/grades': {
        get: {
          operationId: 'getMyGrades',
          tags: ['student'],
          description: 'Student: my last 50 exam results in every center, newest first.',
          security: [{ bearer: [] }],
          responses: { 200: { description: 'My grades', content: json(myGrades) }, ...errors },
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
      '/api/v1/members/{id}/password-reset': {
        post: {
          operationId: 'createStaffResetLink',
          tags: ['members'],
          description:
            'Owner only. A single-use link (24 hours) for a teacher or assistant whose account belongs to this workspace alone (no other workspace, no student account); otherwise RESET_NOT_ALLOWED, so an owner cannot take over an account used elsewhere.',
          security: [{ bearer: [] }],
          requestParams: { path: z.object({ id: z.uuid() }) },
          responses: {
            201: { description: 'The link token, shown only here', content: json(staffResetLink) },
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
      '/api/v1/rooms': {
        get: {
          operationId: 'listRooms',
          tags: ['groups'],
          description: 'Every staff role. Active rooms first, then archived, by name.',
          security: [{ bearer: [] }],
          responses: { 200: { description: 'Rooms', content: json(roomList) }, ...errors },
        },
        post: {
          operationId: 'createRoom',
          tags: ['groups'],
          description: 'Owner only. Names are unique in the workspace (ROOM_NAME_TAKEN).',
          security: [{ bearer: [] }],
          requestBody: { required: true, content: json(createRoomRequest) },
          responses: { 201: { description: 'Created', content: json(room) }, ...errors },
        },
      },
      '/api/v1/rooms/{id}': {
        patch: {
          operationId: 'updateRoom',
          tags: ['groups'],
          description: 'Owner only. Rename, change the capacity, or archive.',
          security: [{ bearer: [] }],
          requestParams: { path: z.object({ id: z.uuid() }) },
          requestBody: { required: true, content: json(updateRoomRequest) },
          responses: { 200: { description: 'Updated', content: json(room) }, ...errors },
        },
      },
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
      '/api/v1/groups/{id}/exams': {
        get: {
          operationId: 'listExams',
          tags: ['exams'],
          description: 'Same visibility as groups. Newest first.',
          security: [{ bearer: [] }],
          requestParams: { path: z.object({ id: z.uuid() }) },
          responses: { 200: { description: 'Exams', content: json(examList) }, ...errors },
        },
        post: {
          operationId: 'createExam',
          tags: ['exams'],
          description: 'Owner, the group teacher, or an assigned assistant.',
          security: [{ bearer: [] }],
          requestParams: { path: z.object({ id: z.uuid() }) },
          requestBody: { required: true, content: json(createExamRequest) },
          responses: { 201: { description: 'Created', content: json(exam) }, ...errors },
        },
      },
      '/api/v1/exams/{id}': {
        get: {
          operationId: 'getExamSheet',
          tags: ['exams'],
          security: [{ bearer: [] }],
          requestParams: { path: z.object({ id: z.uuid() }) },
          responses: {
            200: { description: 'The grade grid', content: json(examSheet) },
            ...errors,
          },
        },
        patch: {
          operationId: 'updateExam',
          tags: ['exams'],
          description: 'A new max score may not be below a recorded score.',
          security: [{ bearer: [] }],
          requestParams: { path: z.object({ id: z.uuid() }) },
          requestBody: { required: true, content: json(updateExamRequest) },
          responses: { 200: { description: 'Updated', content: json(exam) }, ...errors },
        },
        delete: {
          operationId: 'deleteExam',
          tags: ['exams'],
          description: 'Only an exam without results.',
          security: [{ bearer: [] }],
          requestParams: { path: z.object({ id: z.uuid() }) },
          responses: { 204: { description: 'Deleted' }, ...errors },
        },
      },
      '/api/v1/exams/{id}/results': {
        put: {
          operationId: 'saveExamResults',
          tags: ['exams'],
          description: 'Replaces every result of the exam with the grid sent.',
          security: [{ bearer: [] }],
          requestParams: { path: z.object({ id: z.uuid() }) },
          requestBody: { required: true, content: json(saveExamResultsRequest) },
          responses: { 200: { description: 'Saved', content: json(examSheet) }, ...errors },
        },
      },
      '/api/v1/exams/{id}/notify': {
        post: {
          operationId: 'notifyExam',
          tags: ['exams'],
          description:
            'Queues one result message per guardian of the graded students (siblings merged). Repeats queue nothing new.',
          security: [{ bearer: [] }],
          requestParams: { path: z.object({ id: z.uuid() }) },
          responses: {
            200: { description: 'Queued', content: json(notifyExamResponse) },
            ...errors,
          },
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
      '/api/v1/sessions/{id}/open': {
        post: {
          operationId: 'openSession',
          tags: ['attendance'],
          description:
            'Owner, the group teacher, or an assigned assistant. Opening an open session again returns the same key.',
          security: [{ bearer: [] }],
          requestParams: { path: z.object({ id: z.uuid() }) },
          responses: {
            200: { description: 'Open; draw the QR', content: json(openSession) },
            ...errors,
          },
        },
      },
      '/api/v1/sessions/{id}/attendance': {
        get: {
          operationId: 'listAttendance',
          tags: ['attendance'],
          security: [{ bearer: [] }],
          requestParams: { path: z.object({ id: z.uuid() }) },
          responses: {
            200: { description: 'Records so far', content: json(attendanceList) },
            ...errors,
          },
        },
      },
      '/api/v1/stats/today': {
        get: {
          operationId: 'getTodayStats',
          tags: ['attendance'],
          description: 'Numbers for the Today dashboard, for the groups the caller can see.',
          security: [{ bearer: [] }],
          responses: { 200: { description: 'Stats', content: json(todayStats) }, ...errors },
        },
      },
      '/api/v1/stats/trends': {
        get: {
          operationId: 'getTrendStats',
          tags: ['stats'],
          description:
            'The dashboard: attendance per visible group per week and exam averages over the last 8 weeks, and money in per month for the last 6 months (owner and assistant; null for a teacher).',
          security: [{ bearer: [] }],
          responses: { 200: { description: 'Trends', content: json(trendStats) }, ...errors },
        },
      },
      '/api/v1/stats/owing': {
        get: {
          operationId: 'getOwingStudents',
          tags: ['money'],
          description:
            'Owner and assistant: every student whose balance in the groups the caller can see is above zero, biggest first.',
          security: [{ bearer: [] }],
          responses: { 200: { description: 'Who owes', content: json(owingList) }, ...errors },
        },
      },
      '/api/v1/stats/collections': {
        get: {
          operationId: 'getCollectionStats',
          tags: ['money'],
          description:
            "Owner and assistant: payments minus their reversals, today and this month, by method, for the groups the caller can see (an assistant: their teachers' groups).",
          security: [{ bearer: [] }],
          responses: {
            200: { description: 'Collected', content: json(collectionStats) },
            ...errors,
          },
        },
      },
      '/api/v1/stats/cash-summary': {
        get: {
          operationId: 'getCashSummary',
          tags: ['money'],
          description:
            'End-of-day cash summary in the workspace timezone: payments minus their reversals, by method, per staff member who recorded the payment. Assistant and teacher: their own; owner: every staff member.',
          security: [{ bearer: [] }],
          requestParams: { query: cashSummaryQuery },
          responses: {
            200: { description: 'Cash summary', content: json(cashSummary) },
            ...errors,
          },
        },
      },
      '/api/v1/sessions/{id}/roster': {
        get: {
          operationId: 'getSessionRoster',
          tags: ['attendance'],
          description: 'Students enrolled in the session group, for manual marking.',
          security: [{ bearer: [] }],
          requestParams: { path: z.object({ id: z.uuid() }) },
          responses: { 200: { description: 'Roster', content: json(roster) }, ...errors },
        },
      },
      '/api/v1/sessions/{id}/attendance/{studentId}': {
        put: {
          operationId: 'markAttendance',
          tags: ['attendance'],
          description: 'Manual mark by staff; replaces any scan. Open or closed sessions only.',
          security: [{ bearer: [] }],
          requestParams: { path: z.object({ id: z.uuid(), studentId: z.uuid() }) },
          requestBody: { required: true, content: json(markAttendanceRequest) },
          responses: {
            200: { description: 'Recorded', content: json(attendanceRecord) },
            ...errors,
          },
        },
      },
      '/api/v1/sessions/{id}/close': {
        post: {
          operationId: 'closeSession',
          tags: ['attendance'],
          description:
            'Same staff as open. Every active enrolled student without a record is marked absent (auto_close).',
          security: [{ bearer: [] }],
          requestParams: { path: z.object({ id: z.uuid() }) },
          responses: {
            200: { description: 'Final attendance', content: json(attendanceList) },
            ...errors,
          },
        },
      },
      '/api/v1/sessions/{id}/live': {
        get: {
          operationId: 'liveAttendance',
          tags: ['attendance'],
          description:
            'Server-sent events: every record so far, then each new or changed record as `data: AttendanceRecord`. Read with fetch (it needs the Authorization header), not the generated client.',
          security: [{ bearer: [] }],
          requestParams: { path: z.object({ id: z.uuid() }) },
          responses: {
            200: {
              description: 'text/event-stream',
              content: { 'text/event-stream': { schema: attendanceRecord } },
            },
            ...errors,
          },
        },
      },
      '/api/v1/students/{id}/ledger': {
        get: {
          operationId: 'getStudentLedger',
          tags: ['money'],
          description: 'Entries of the groups the caller can see, newest first, and their sum.',
          security: [{ bearer: [] }],
          requestParams: { path: z.object({ id: z.uuid() }) },
          responses: { 200: { description: 'Ledger', content: json(studentLedger) }, ...errors },
        },
      },
      '/api/v1/payments': {
        post: {
          operationId: 'createPayment',
          tags: ['money'],
          description:
            'Needs an Idempotency-Key header: a retry with the same key returns the first entry.',
          security: [{ bearer: [] }],
          requestParams: { header: z.object({ 'idempotency-key': z.string().min(8).max(100) }) },
          requestBody: { required: true, content: json(createPaymentRequest) },
          responses: { 201: { description: 'Recorded', content: json(ledgerEntry) }, ...errors },
        },
      },
      '/api/v1/ledger/{id}/reverse': {
        post: {
          operationId: 'reverseEntry',
          tags: ['money'],
          description:
            'Owner, or whoever recorded the entry. Needs an Idempotency-Key header. The entry stays; a new one cancels it.',
          security: [{ bearer: [] }],
          requestParams: {
            path: z.object({ id: z.uuid() }),
            header: z.object({ 'idempotency-key': z.string().min(8).max(100) }),
          },
          responses: {
            201: { description: 'The reversal', content: json(ledgerEntry) },
            ...errors,
          },
        },
      },
      '/api/v1/ledger/{id}/receipt': {
        get: {
          operationId: 'getReceipt',
          tags: ['money'],
          security: [{ bearer: [] }],
          requestParams: { path: z.object({ id: z.uuid() }) },
          responses: { 200: { description: 'Receipt data', content: json(receipt) }, ...errors },
        },
      },
      '/api/v1/messages': {
        get: {
          operationId: 'listMessages',
          tags: ['messages'],
          description: 'Owner and assistant. The message log, newest first, first 100.',
          security: [{ bearer: [] }],
          requestParams: { query: listMessagesQuery },
          responses: {
            200: { description: 'Messages', content: json(outboxMessageList) },
            ...errors,
          },
        },
      },
      '/api/v1/attendance-settings': {
        get: {
          operationId: 'getAttendanceSettings',
          tags: ['attendance'],
          description: 'Every staff role. The late threshold (default 15 minutes).',
          security: [{ bearer: [] }],
          responses: {
            200: { description: 'Settings', content: json(attendanceSettings) },
            ...errors,
          },
        },
        put: {
          operationId: 'updateAttendanceSettings',
          tags: ['attendance'],
          description: 'Owner only. Applies to check-ins from now on.',
          security: [{ bearer: [] }],
          requestBody: { required: true, content: json(attendanceSettings) },
          responses: {
            200: { description: 'Saved', content: json(attendanceSettings) },
            ...errors,
          },
        },
      },
      '/api/v1/message-templates': {
        get: {
          operationId: 'listMessageTemplates',
          tags: ['messages'],
          description:
            'Owner and assistant. Each trigger with its placeholders and, per language, the default and the custom wording (null = default).',
          security: [{ bearer: [] }],
          responses: {
            200: { description: 'Templates', content: json(messageTemplateList) },
            ...errors,
          },
        },
      },
      '/api/v1/message-templates/{trigger}': {
        put: {
          operationId: 'updateMessageTemplate',
          tags: ['messages'],
          description:
            'Owner only. Empty or null = the default. Unknown placeholders: TEMPLATE_PLACEHOLDER_UNKNOWN. Applies to messages sent from now on, queued ones too.',
          security: [{ bearer: [] }],
          requestParams: { path: z.object({ trigger: messageTrigger }) },
          requestBody: { required: true, content: json(updateMessageTemplateRequest) },
          responses: { 200: { description: 'Saved', content: json(messageTemplate) }, ...errors },
        },
      },
      '/api/v1/message-settings': {
        get: {
          operationId: 'getMessageSettings',
          tags: ['messages'],
          description: 'Every staff role. Which events message parents.',
          security: [{ bearer: [] }],
          responses: {
            200: { description: 'Settings', content: json(messageSettings) },
            ...errors,
          },
        },
        put: {
          operationId: 'updateMessageSettings',
          tags: ['messages'],
          description: 'Owner only. Applies to events from now on; queued messages still go out.',
          security: [{ bearer: [] }],
          requestBody: { required: true, content: json(messageSettings) },
          responses: {
            200: { description: 'Settings', content: json(messageSettings) },
            ...errors,
          },
        },
      },
      '/api/v1/dev/phone': {
        get: {
          operationId: 'listFakePhoneMessages',
          tags: ['messages'],
          description:
            'Development and demos only (DEV_FAKE_PHONE=1): the last 100 parent messages sent in the workspace, newest first.',
          security: [{ bearer: [] }],
          responses: {
            200: { description: 'Sent messages', content: json(sentMessageList) },
            ...errors,
          },
        },
      },
      '/api/v1/check-ins': {
        post: {
          operationId: 'checkIn',
          tags: ['attendance'],
          description:
            'Student scan. A repeat for the same session returns the first record (the session and student are the idempotency key).',
          security: [{ bearer: [] }],
          requestBody: { required: true, content: json(checkInRequest) },
          responses: { 200: { description: 'Checked in', content: json(checkIn) }, ...errors },
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
