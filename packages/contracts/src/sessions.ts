import * as z from 'zod';
import { clockTime, curriculumItem } from './groups.js';

/** A local calendar date in the workspace timezone, "YYYY-MM-DD". */
export const localDate = z.iso.date();

export const sessionStatus = z.enum(['scheduled', 'open', 'closed', 'cancelled']);

export const listSessionsQuery = z
  .object({ from: localDate, to: localDate })
  .refine((q) => q.to >= q.from, { path: ['to'], message: 'RANGE_ENDS_BEFORE_START' })
  .refine((q) => Date.parse(q.to) - Date.parse(q.from) <= 31 * 86_400_000, {
    path: ['to'],
    message: 'RANGE_TOO_LONG',
  })
  .meta({ id: 'ListSessionsQuery' });

/** Move a session: a new local date and times in the workspace timezone. */
export const moveSessionRequest = z
  .object({ date: localDate, startTime: clockTime, endTime: clockTime })
  .refine((m) => m.endTime > m.startTime, { path: ['endTime'], message: 'SLOT_ENDS_BEFORE_START' })
  .meta({ id: 'MoveSessionRequest' });

export const session = z
  .object({
    id: z.uuid(),
    groupId: z.uuid(),
    // UTC instants; the web app shows them in the workspace timezone.
    startsAt: z.iso.datetime({ offset: true }),
    endsAt: z.iso.datetime({ offset: true }),
    status: sessionStatus,
    // True when the session no longer sits at the time its slot produced.
    moved: z.boolean(),
    teacherMembershipId: z.uuid(),
    teacherName: z.string(),
    subject: curriculumItem,
    gradeLevel: curriculumItem,
  })
  .meta({ id: 'Session' });

export const sessionList = z.array(session).meta({ id: 'SessionList' });

export type ListSessionsQuery = z.infer<typeof listSessionsQuery>;
export type MoveSessionRequest = z.infer<typeof moveSessionRequest>;
export type Session = z.infer<typeof session>;
