import * as z from 'zod';
import { attendanceStatus } from './attendance.js';
import { curriculumItem } from './groups.js';
import { sessionStatus } from './sessions.js';

const center = z.object({ nameAr: z.string(), nameEn: z.string().nullable() });

/** A session of a group the signed-in student is enrolled in, in any of their centers. */
export const mySession = z
  .object({
    id: z.uuid(),
    center,
    subject: curriculumItem,
    gradeLevel: curriculumItem,
    teacherName: z.string(),
    startsAt: z.iso.datetime(),
    endsAt: z.iso.datetime(),
    status: sessionStatus,
    // For display in the center's own timezone.
    timezone: z.string(),
  })
  .meta({ id: 'MySession' });

export const mySchedule = z.array(mySession).meta({ id: 'MySchedule' });

export const myAttendanceRecord = z
  .object({
    sessionId: z.uuid(),
    center,
    subject: curriculumItem,
    startsAt: z.iso.datetime(),
    timezone: z.string(),
    status: attendanceStatus,
  })
  .meta({ id: 'MyAttendanceRecord' });

export const myAttendance = z.array(myAttendanceRecord).meta({ id: 'MyAttendance' });

export type MySession = z.infer<typeof mySession>;
export type MyAttendanceRecord = z.infer<typeof myAttendanceRecord>;
