import * as z from 'zod';
import { curriculumItem } from './groups.js';
import { paymentMethod } from './money.js';
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
    // Only with `archived=true`: an archived group that met in those weeks.
    archived: z.boolean(),
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
 * The dashboard: the last 8, 13 or 26 weeks, or the weeks of a custom range (Saturday starts,
 * workspace timezone) for the caller's visible groups, and money in for the last 6 months or the
 * range's months (owner and assistant; null for a teacher).
 */
export const trendStats = z
  .object({
    weeks: z.array(localDate),
    groups: z.array(groupTrend),
    money: z.array(monthTotals).nullable(),
  })
  .meta({ id: 'TrendStats' });

/**
 * How many weeks the dashboard covers: 8 (default), 13 (a term) or 26 (half a year) up to today,
 * or `from`..`to` (local dates, both or neither, up to a year; wins over `weeks`).
 * `archived=true` adds the archived groups that met in those weeks.
 */
export const trendsQuery = z
  .object({
    weeks: z.enum(['8', '13', '26']).default('8'),
    from: localDate.optional(),
    to: localDate.optional(),
    archived: z.enum(['true']).optional(),
  })
  .refine((q) => !q.from === !q.to, { path: ['to'], message: 'RANGE_INCOMPLETE' })
  .refine((q) => !q.from || !q.to || q.to >= q.from, {
    path: ['to'],
    message: 'RANGE_ENDS_BEFORE_START',
  })
  .refine((q) => !q.from || !q.to || Date.parse(q.to) - Date.parse(q.from) < 366 * 86_400_000, {
    path: ['to'],
    message: 'RANGE_TOO_LONG',
  })
  .meta({ id: 'TrendsQuery' });

/** The day of a cash summary; omitted = today in the workspace timezone. */
export const cashSummaryQuery = z
  .object({ date: localDate.optional() })
  .meta({ id: 'CashSummaryQuery' });

/** One line of a cash summary: a payment (money in, > 0) or a reversal of one (< 0). */
export const cashEntry = z
  .object({
    id: z.uuid(),
    kind: z.enum(['payment', 'reversal']),
    // The payment's receipt number (for a reversal: the voided payment's).
    receiptNo: z.int(),
    studentName: z.string(),
    amountPiastres: z.int(),
    method: paymentMethod,
    createdAt: z.iso.datetime(),
  })
  .meta({ id: 'CashEntry' });

/** What one staff member took on the day: the payments they recorded minus their reversals. */
export const staffCash = z
  .object({
    userId: z.uuid(),
    name: z.string(),
    totals: methodTotals,
    // Oldest first.
    entries: z.array(cashEntry),
  })
  .meta({ id: 'StaffCash' });

/**
 * End-of-day cash summary, per recorder of the original payment, in the workspace timezone.
 * Assistant and teacher: their own (always one item). Owner: everyone with entries, and their own.
 */
export const cashSummary = z
  .object({
    date: localDate,
    timezone: z.string(),
    center: z.object({ nameAr: z.string(), nameEn: z.string().nullable() }),
    staff: z.array(staffCash),
  })
  .meta({ id: 'CashSummary' });

export type StatsDay = z.infer<typeof statsDay>;
export type OwingStudent = z.infer<typeof owingStudent>;
export type MethodTotals = z.infer<typeof methodTotals>;
export type CollectionStats = z.infer<typeof collectionStats>;
export type TodayStats = z.infer<typeof todayStats>;
export type WeekCount = z.infer<typeof weekCount>;
export type GroupTrend = z.infer<typeof groupTrend>;
export type MonthTotals = z.infer<typeof monthTotals>;
export type TrendStats = z.infer<typeof trendStats>;
export type TrendsQuery = z.infer<typeof trendsQuery>;
export type CashSummaryQuery = z.infer<typeof cashSummaryQuery>;
export type CashEntry = z.infer<typeof cashEntry>;
export type StaffCash = z.infer<typeof staffCash>;
export type CashSummary = z.infer<typeof cashSummary>;
