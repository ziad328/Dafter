import * as z from 'zod';

export const attendanceStatus = z.enum(['present', 'late', 'absent', 'excused', 'makeup']);
export const attendanceMethod = z.enum(['student_scan', 'manual', 'auto_close']);

/** Returned to the teacher's screen, which draws a new QR every `windowMs` from it. */
export const openSession = z
  .object({
    sessionId: z.uuid(),
    // base64url HMAC key. QR text = `${sessionId}.${window}.${mac}` where
    // window = floor(serverNow / windowMs) and mac = base64url(HMAC-SHA256(key, `${sessionId}.${window}`)[0..16]).
    qrKey: z.string(),
    serverTime: z.iso.datetime(),
    windowMs: z.int(),
  })
  .meta({ id: 'OpenSession' });

export const checkInRequest = z
  .object({
    // The scanned QR text, as is.
    code: z.string().max(200),
    // base64url ECDSA P-256 / SHA-256 signature (IEEE P1363) over `code`, by the bound phone key.
    signature: z
      .string()
      .regex(/^[\w-]+$/)
      .max(200),
  })
  .meta({ id: 'CheckInRequest' });

export const checkIn = z
  .object({
    id: z.uuid(),
    sessionId: z.uuid(),
    status: attendanceStatus,
    recordedAt: z.iso.datetime(),
  })
  .meta({ id: 'CheckIn' });

export const markAttendanceRequest = z
  .object({ status: attendanceStatus })
  .meta({ id: 'MarkAttendanceRequest' });

export const attendanceRecord = z
  .object({
    id: z.uuid(),
    studentId: z.uuid(),
    nameAr: z.string(),
    nameEn: z.string().nullable(),
    status: attendanceStatus,
    method: attendanceMethod,
    recordedAt: z.iso.datetime(),
  })
  .meta({ id: 'AttendanceRecord' });

export const attendanceList = z.array(attendanceRecord).meta({ id: 'AttendanceList' });

/** The students expected in a session: active, non-archived enrollments of its group. */
export const rosterEntry = z
  .object({ studentId: z.uuid(), nameAr: z.string(), nameEn: z.string().nullable() })
  .meta({ id: 'RosterEntry' });
export const roster = z.array(rosterEntry).meta({ id: 'Roster' });

export type OpenSession = z.infer<typeof openSession>;
export type CheckInRequest = z.infer<typeof checkInRequest>;
export type CheckIn = z.infer<typeof checkIn>;
export type MarkAttendanceRequest = z.infer<typeof markAttendanceRequest>;
export type RosterEntry = z.infer<typeof rosterEntry>;
export type AttendanceRecord = z.infer<typeof attendanceRecord>;

/** Per-workspace attendance rules. A check-in this many minutes after the start is "late". */
export const attendanceSettings = z
  .object({ lateAfterMinutes: z.int().min(0).max(120) })
  .meta({ id: 'AttendanceSettings' });

export type AttendanceSettings = z.infer<typeof attendanceSettings>;
