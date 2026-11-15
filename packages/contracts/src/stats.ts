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

/** Attendance of one group in one week: checked-in records out of all records. */
export const weekCount = z
  .object({ present: z.int().min(0), total: z.int().min(0) })
  .meta({ id: 'WeekCount' });

/** One exam's average as a percent of its max (null before any score). */
export const examPoint = z
  .object({
    id: z.uuid(),
    title: z.string(),
    heldOn: localDate,
    averagePct: z.number().nullable(),
  })
  .meta({ id: 'ExamPoint' });

export const groupTrend = z
  .object({
    id: z.uuid(),
    subject: curriculumItem,
    gradeLevel: curriculumItem,
    label: z.string().nullable(),
    teacherName: z.string(),
    // One per week of `weeks`, oldest first.
    attendance: z.array(weekCount),
    // Exams held in those weeks, oldest first.
    exams: z.array(examPoint),
  })
  .meta({ id: 'GroupTrend' });

export const monthTotals = methodTotals
  .extend({ month: z.string().regex(/^\d{4}-\d{2}$/) })
  .meta({ id: 'MonthTotals' });

/**
 * The dashboard: the last 8 weeks (Saturday starts, workspace timezone) for the caller's visible
 * groups, and money in for the last 6 months (owner and assistant; null for a teacher).
 */
export const trendStats = z
  .object({
    weeks: z.array(localDate),
    groups: z.array(groupTrend),
    money: z.array(monthTotals).nullable(),
  })
  .meta({ id: 'TrendStats' });

export type StatsDay = z.infer<typeof statsDay>;
export type OwingStudent = z.infer<typeof owingStudent>;
export type MethodTotals = z.infer<typeof methodTotals>;
export type CollectionStats = z.infer<typeof collectionStats>;
export type TodayStats = z.infer<typeof todayStats>;
export type WeekCount = z.infer<typeof weekCount>;
export type GroupTrend = z.infer<typeof groupTrend>;
export type MonthTotals = z.infer<typeof monthTotals>;
export type TrendStats = z.infer<typeof trendStats>;
