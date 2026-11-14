import * as z from 'zod';
import { localDate } from './sessions.js';

/** One day of the attendance chart: records of that day's closed or open sessions. */
export const statsDay = z
  .object({ date: localDate, present: z.int().min(0), total: z.int().min(0) })
  .meta({ id: 'StatsDay' });

/**
 * The Today dashboard's numbers for the caller's visible groups (owner: all; teacher: own;
 * assistant: assigned teachers'). "Today" and the week are in the workspace timezone.
 */
export const todayStats = z
  .object({
    sessionsToday: z.int().min(0),
    // Active enrollments of today's non-cancelled sessions (a student in two sessions counts twice).
    expectedToday: z.int().min(0),
    // Present, late or make-up records in today's sessions.
    checkedInToday: z.int().min(0),
    activeStudents: z.int().min(0),
    // The last 7 days, oldest first, today included.
    week: z.array(statsDay).length(7),
  })
  .meta({ id: 'TodayStats' });

export type StatsDay = z.infer<typeof statsDay>;
export type TodayStats = z.infer<typeof todayStats>;
