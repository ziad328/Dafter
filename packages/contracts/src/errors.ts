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
  RATE_LIMITED: 429,
  INVALID_CREDENTIALS: 401,
  PHONE_TAKEN: 409,
  EMAIL_TAKEN: 409,
  // Unknown id, or not a member: both 404 so a workspace's existence never leaks.
  WORKSPACE_NOT_FOUND: 404,
  // Unknown, used and expired tokens look the same, so tokens cannot be probed.
  INVITE_INVALID: 410,
  ALREADY_MEMBER: 409,
  MEMBER_NOT_ASSISTANT: 409,
  // A scope target is missing from the workspace or is not a teacher.
  SCOPE_TEACHER_INVALID: 400,
  // Unknown id, another workspace's group, or outside the caller's scope: never 403.
  GROUP_NOT_FOUND: 404,
  // A subject, grade level or teacher that is not in this workspace (details.field names it).
  GROUP_REFERENCE_INVALID: 400,
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
