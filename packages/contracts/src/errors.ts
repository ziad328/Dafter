import * as z from 'zod';

/**
 * Every error the API can return. The web app translates each code (errors.<CODE> in packages/i18n),
 * so the API never sends sentences. Feature codes such as ATTENDANCE_ALREADY_RECORDED are added
 * here with their feature.
 */
export const ERROR_STATUS = {
  VALIDATION_FAILED: 400,
  UNAUTHENTICATED: 401,
  FORBIDDEN: 403,
  NOT_FOUND: 404,
  CONFLICT: 409,
  // details.retryAfterSeconds: how long until the caller may try again (audit 3 A3).
  RATE_LIMITED: 429,
  INVALID_CREDENTIALS: 401,
  PHONE_TAKEN: 409,
  EMAIL_TAKEN: 409,
  // Unknown id, or not a member: both 404 so a workspace's existence never leaks.
  WORKSPACE_NOT_FOUND: 404,
  // Unknown, used and expired tokens look the same, so tokens cannot be probed.
  INVITE_INVALID: 410,
  // Password reset link: unknown, used and expired look the same, like invites.
  RESET_INVALID: 410,
  // An owner can issue a reset link only for staff whose account is in this workspace alone.
  RESET_NOT_ALLOWED: 409,
  ALREADY_MEMBER: 409,
  MEMBER_NOT_ASSISTANT: 409,
  // The workspace's only active owner can't be demoted or removed: make another owner first.
  LAST_OWNER: 409,
  // Made an assistant while still teaching active groups (details.count): reassign them first.
  MEMBER_TEACHES_GROUPS: 409,
  // A scope target is missing from the workspace or is not a teacher.
  SCOPE_TEACHER_INVALID: 400,
  // Unknown id, another workspace's group, or outside the caller's scope: never 403.
  GROUP_NOT_FOUND: 404,
  ROOM_NOT_FOUND: 404,
  ROOM_NAME_TAKEN: 409,
  // The room is taken at that time. From a group's slots: details give the clashing weekday,
  // startTime and endTime (local). From a move or a race: no details.
  ROOM_BOOKED: 409,
  // Unknown id or another workspace's subject or grade level: never 403.
  CURRICULUM_ITEM_NOT_FOUND: 404,
  // A second subject (or grade level) with the same Arabic name in the workspace.
  CURRICULUM_NAME_TAKEN: 409,
  // A reorder whose ids are not exactly the workspace's list (one was added since): reload.
  CURRICULUM_ORDER_STALE: 409,
  // A subject, grade level or teacher that is not in this workspace, or a newly picked subject or
  // grade level that is archived (details.field names it).
  GROUP_REFERENCE_INVALID: 400,
  // Unknown id, another workspace's session, or outside the caller's scope: never 403.
  SESSION_NOT_FOUND: 404,
  // Cancel or move of a session that is already open, closed or cancelled.
  SESSION_NOT_SCHEDULED: 409,
  // Opening a session more than 30 minutes before its start (details.opensAt: the first moment
  // it can be opened, ISO).
  SESSION_TOO_EARLY: 409,
  // A move to a time that has already passed.
  SESSION_TIME_INVALID: 400,
  // A move onto another non-cancelled session of the same teacher (details: the clash's local
  // date, startTime and endTime). From a group's slots: the teacher's other active group meets
  // then (details: weekday, startTime, endTime); resend with force: true to save anyway.
  TEACHER_BOOKED: 409,
  // Unknown id or another workspace's student: never 403.
  STUDENT_NOT_FOUND: 404,
  // A grade level that is not in this workspace.
  STUDENT_REFERENCE_INVALID: 400,
  // Wrong, expired, used up or never sent: one code, so emails cannot be probed.
  OTP_INVALID: 400,
  STUDENT_ALREADY_ACTIVATED: 409,
  // The account already has an active phone (an assistant resets it), or the key is taken.
  DEVICE_ALREADY_BOUND: 409,
  DEVICE_KEY_INVALID: 400,
  ENROLLMENT_EXISTS: 409,
  // The group's active enrollments already reach its capacity (details: count, capacity).
  // Resend with force: true to add the student anyway.
  GROUP_FULL: 409,
  ENROLLMENT_NOT_FOUND: 404,
  // Check-in or manual mark on a session that is not open (manual also allows closed).
  SESSION_NOT_OPEN: 409,
  // Not a Dafter QR, a forged MAC, or a window too far in the future.
  CHECKIN_CODE_INVALID: 400,
  // A real code older than the previous 10-second window: scan the screen again.
  CHECKIN_CODE_EXPIRED: 410,
  DEVICE_NOT_BOUND: 403,
  DEVICE_SIGNATURE_INVALID: 403,
  // Payments and reversals must carry an Idempotency-Key header (a phone may retry them).
  IDEMPOTENCY_KEY_REQUIRED: 400,
  // The key was already used for a different request.
  IDEMPOTENCY_KEY_REUSED: 409,
  ENTRY_NOT_FOUND: 404,
  ENTRY_ALREADY_REVERSED: 409,
  // Reversals are not reversed; record a new entry instead.
  ENTRY_NOT_REVERSIBLE: 409,
  // Unknown id, another workspace's exam, or a group outside the caller's scope: never 403.
  EXAM_NOT_FOUND: 404,
  // A score above the exam's max (details.studentId), or a new max below a recorded score.
  EXAM_SCORE_ABOVE_MAX: 400,
  // A message template uses a placeholder its trigger doesn't offer (details.placeholder, locale).
  TEMPLATE_PLACEHOLDER_UNKNOWN: 400,
  // A result for a student who was never enrolled in the exam's group (details.studentId).
  EXAM_STUDENT_INVALID: 400,
  // Delete an exam that has results: clear the grid first.
  EXAM_HAS_RESULTS: 409,
  // Send to parents before any result is recorded.
  EXAM_NOT_GRADED: 409,
  INTERNAL: 500,
} as const;

export type ErrorCode = keyof typeof ERROR_STATUS;
export const ERROR_CODES = Object.keys(ERROR_STATUS) as ErrorCode[];

export const errorCode = z
  .enum(ERROR_CODES as [ErrorCode, ...ErrorCode[]])
  .meta({ id: 'ErrorCode' });

export const errorResponse = z
  .object({
    code: errorCode,
    details: z.record(z.string(), z.unknown()).optional(),
  })
  .meta({ id: 'ErrorResponse' });

export type ErrorResponse = z.infer<typeof errorResponse>;
