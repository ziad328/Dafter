import * as z from 'zod';
import { mobilePhone } from './auth.js';
import { curriculumItem } from './groups.js';

const name = z.string().trim().min(2).max(100);
const optionalText = z.string().trim().min(1).max(100);
export const guardianRelation = z.enum(['father', 'mother', 'other']);
export const studentStatus = z.enum(['active', 'archived']);

/** A parent found by phone in the workspace is reused, so siblings share one guardian. */
export const guardianInput = z
  .object({
    phone: mobilePhone,
    name: optionalText.optional(),
    relation: guardianRelation,
    preferredLocale: z.enum(['ar', 'en']),
    whatsappOptIn: z.boolean(),
  })
  .meta({ id: 'GuardianInput' });

export const createStudentRequest = z
  .object({
    nameAr: name,
    nameEn: name.optional(),
    phone: mobilePhone.optional(),
    gradeLevelId: z.uuid(),
    school: optionalText.optional(),
    guardian: guardianInput,
  })
  .meta({ id: 'CreateStudentRequest' });

export const updateStudentRequest = z
  .object({
    nameAr: name,
    nameEn: name.nullable(),
    phone: mobilePhone.nullable(),
    gradeLevelId: z.uuid(),
    school: optionalText.nullable(),
    status: studentStatus,
    // Becomes the primary guardian (found or created by phone).
    guardian: guardianInput,
  })
  .partial()
  .meta({ id: 'UpdateStudentRequest' });

export const listStudentsQuery = z
  .object({
    // A name (Arabic or English, normalized) or the start of a student or parent phone.
    q: z.string().trim().max(100).optional(),
  })
  .meta({ id: 'ListStudentsQuery' });

export const guardian = z
  .object({
    id: z.uuid(),
    name: z.string().nullable(),
    phone: z.string(),
    relation: guardianRelation,
    preferredLocale: z.enum(['ar', 'en']),
    whatsappOptIn: z.boolean(),
    isPrimary: z.boolean(),
  })
  .meta({ id: 'Guardian' });

export const student = z
  .object({
    id: z.uuid(),
    nameAr: z.string(),
    nameEn: z.string().nullable(),
    phone: z.string().nullable(),
    gradeLevel: curriculumItem,
    school: z.string().nullable(),
    status: studentStatus,
    guardians: z.array(guardian),
  })
  .meta({ id: 'Student' });

export const studentList = z.array(student).meta({ id: 'StudentList' });

export type GuardianInput = z.infer<typeof guardianInput>;
export type CreateStudentRequest = z.infer<typeof createStudentRequest>;
export type UpdateStudentRequest = z.infer<typeof updateStudentRequest>;
export type ListStudentsQuery = z.infer<typeof listStudentsQuery>;
export type Student = z.infer<typeof student>;
