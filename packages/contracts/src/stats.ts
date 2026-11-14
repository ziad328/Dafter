import * as z from 'zod';
import { curriculumItem } from './groups.js';
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

/** Money in for one period, in integer piastres: payments minus their reversals. */
export const methodTotals = z
  .object({ cash: z.int(), vodafone_cash: z.int(), instapay: z.int(), total: z.int() })
  .meta({ id: 'MethodTotals' });

/** Owner and assistant: money collected today and this month in the caller's groups, in the workspace timezone. */
export const collectionStats = z
  .object({ today: methodTotals, month: methodTotals })
  .meta({ id: 'CollectionStats' });

/** A student who owes, with the balance of the ledger entries of the caller's groups. */
export const owingStudent = z
  .object({
    id: z.uuid(),
    nameAr: z.string(),
    nameEn: z.string().nullable(),
    gradeLevel: curriculumItem,
    balancePiastres: z.int().min(1),
  })
  .meta({ id: 'OwingStudent' });

export const owingList = z.array(owingStudent).meta({ id: 'OwingList' });

export type StatsDay = z.infer<typeof statsDay>;
export type OwingStudent = z.infer<typeof owingStudent>;
export type MethodTotals = z.infer<typeof methodTotals>;
export type CollectionStats = z.infer<typeof collectionStats>;
export type TodayStats = z.infer<typeof todayStats>;
