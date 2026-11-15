import * as z from 'zod';
import { curriculumItem } from './groups.js';
import { localDate } from './sessions.js';

export const createExamRequest = z
  .object({
    title: z.string().trim().min(1).max(100),
    heldOn: localDate,
    maxScore: z.int().min(1).max(1000),
  })
  .meta({ id: 'CreateExamRequest' });

export const updateExamRequest = createExamRequest.partial().meta({ id: 'UpdateExamRequest' });

/** An exam with its summary over the recorded results. */
export const exam = z
  .object({
    id: z.uuid(),
    groupId: z.uuid(),
    title: z.string(),
    heldOn: localDate,
    maxScore: z.int(),
    // Students with a score, and students marked absent.
    graded: z.int().min(0),
    absent: z.int().min(0),
    // Mean score of the graded students; null before any score.
    average: z.number().nullable(),
    // Set by the first "send to parents".
    notifiedAt: z.iso.datetime().nullable(),
  })
  .meta({ id: 'Exam' });

export const examList = z.array(exam).meta({ id: 'ExamList' });

/** One row of the grade grid: no score and not absent = not entered yet. */
export const examSheetRow = z
  .object({
    studentId: z.uuid(),
    nameAr: z.string(),
    nameEn: z.string().nullable(),
    score: z.int().nullable(),
    absent: z.boolean(),
  })
  .meta({ id: 'ExamSheetRow' });

/** The exam and its grid: every active student of the group, plus anyone already graded. */
export const examSheet = z
  .object({
    exam,
    subject: curriculumItem,
    groupLabel: z.string().nullable(),
    rows: z.array(examSheetRow),
  })
  .meta({ id: 'ExamSheet' });

export const examResultInput = z
  .object({
    studentId: z.uuid(),
    score: z.int().min(0).nullable(),
    absent: z.boolean(),
  })
  .refine((r) => r.absent === (r.score === null), { message: 'SCORE_OR_ABSENT' });

/**
 * The whole grid. It replaces the exam's results: a student left out has no result, so saving
 * twice gives the same state.
 */
export const saveExamResultsRequest = z
  .object({ results: z.array(examResultInput).max(500) })
  .refine((b) => new Set(b.results.map((r) => r.studentId)).size === b.results.length, {
    message: 'DUPLICATE_STUDENT',
  })
  .meta({ id: 'SaveExamResultsRequest' });

export const notifyExamResponse = z
  .object({ queued: z.int().min(0) })
  .meta({ id: 'NotifyExamResponse' });

const center = z.object({ nameAr: z.string(), nameEn: z.string().nullable() });

/** Student app: one of my results, in any center. */
export const myGrade = z
  .object({
    examId: z.uuid(),
    center,
    subject: curriculumItem,
    title: z.string(),
    heldOn: localDate,
    maxScore: z.int(),
    score: z.int().nullable(),
    absent: z.boolean(),
  })
  .meta({ id: 'MyGrade' });

export const myGrades = z.array(myGrade).meta({ id: 'MyGrades' });

export type CreateExamRequest = z.infer<typeof createExamRequest>;
export type UpdateExamRequest = z.infer<typeof updateExamRequest>;
export type Exam = z.infer<typeof exam>;
export type ExamSheet = z.infer<typeof examSheet>;
export type ExamSheetRow = z.infer<typeof examSheetRow>;
export type SaveExamResultsRequest = z.infer<typeof saveExamResultsRequest>;
export type NotifyExamResponse = z.infer<typeof notifyExamResponse>;
export type MyGrade = z.infer<typeof myGrade>;
