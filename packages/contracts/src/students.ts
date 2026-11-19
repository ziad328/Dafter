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

/** Up to 3 more parents besides the primary one; every parent is texted unless the student says otherwise. */
const extraGuardians = z.array(guardianInput).max(3);

type GuardianFields = { guardian?: { phone: string }; extraGuardians?: { phone: string }[] };

/**
 * Extra parents are sent with the primary one (the form always sends both), and no phone appears
 * twice: GUARDIAN_DUPLICATE on the repeated extra.
 */
export const checkGuardians = (v: GuardianFields, ctx: z.RefinementCtx) => {
  if (!v.extraGuardians) return;
  if (!v.guardian)
    ctx.addIssue({ code: 'custom', path: ['guardian'], message: 'GUARDIAN_REQUIRED' });
  const seen = new Set(v.guardian ? [v.guardian.phone] : []);
  v.extraGuardians.forEach((g, i) => {
    if (seen.has(g.phone))
      ctx.addIssue({
        code: 'custom',
        path: ['extraGuardians', i, 'phone'],
        message: 'GUARDIAN_DUPLICATE',
      });
    seen.add(g.phone);
  });
};

/** The create fields, unrefined, so the web form can extend them. */
export const createStudentFields = z.object({
  nameAr: name,
  nameEn: name.optional(),
  phone: mobilePhone.optional(),
  gradeLevelId: z.uuid(),
  school: optionalText.optional(),
  guardian: guardianInput,
  // Replaces the student's other parents when sent; left out, they stay as they are.
  extraGuardians: extraGuardians.optional(),
});

export const createStudentRequest = createStudentFields
  .superRefine(checkGuardians)
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
    // Replaces the other (non-primary) parents; needs `guardian` too.
    extraGuardians,
  })
  .partial()
  .superRefine(checkGuardians)
  .meta({ id: 'UpdateStudentRequest' });

export const listStudentsQuery = z
  .object({
    // A name (Arabic or English, normalized) or the start of a student or parent phone.
    q: z.string().trim().max(100).optional(),
    // Narrow to one group's active students, one grade, or those who owe (most owed first).
    groupId: z.uuid().optional(),
    gradeLevelId: z.uuid().optional(),
    owes: z.enum(['true']).optional(),
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
    // The student has activated the app (linked to a login) / has a bound phone.
    activated: z.boolean(),
    deviceBound: z.boolean(),
    // Sum of the ledger, in piastres: positive owes, negative is credit.
    balancePiastres: z.int(),
  })
  .meta({ id: 'Student' });

export const studentList = z.array(student).meta({ id: 'StudentList' });

export type GuardianInput = z.infer<typeof guardianInput>;
export type CreateStudentRequest = z.infer<typeof createStudentRequest>;
export type UpdateStudentRequest = z.infer<typeof updateStudentRequest>;
export type ListStudentsQuery = z.infer<typeof listStudentsQuery>;
export type Guardian = z.infer<typeof guardian>;
export type Student = z.infer<typeof student>;
