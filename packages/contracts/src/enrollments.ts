import * as z from 'zod';
import { curriculumItem } from './groups.js';

export const enrollmentStatus = z.enum(['active', 'left']);

export const createEnrollmentRequest = z
  .object({
    groupId: z.uuid(),
    discountPct: z.int().min(0).max(100).optional(),
    // Add even when the group is full (the staff member confirmed GROUP_FULL).
    force: z.boolean().optional(),
  })
  .meta({ id: 'CreateEnrollmentRequest' });

export const enrollment = z
  .object({
    id: z.uuid(),
    groupId: z.uuid(),
    subject: curriculumItem,
    gradeLevel: curriculumItem,
    teacherName: z.string(),
    discountPct: z.int(),
    status: enrollmentStatus,
    joinedAt: z.iso.datetime(),
    leftAt: z.iso.datetime().nullable(),
  })
  .meta({ id: 'Enrollment' });

export const enrollmentList = z.array(enrollment).meta({ id: 'EnrollmentList' });

export type CreateEnrollmentRequest = z.infer<typeof createEnrollmentRequest>;
export type Enrollment = z.infer<typeof enrollment>;
