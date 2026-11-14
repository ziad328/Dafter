import * as z from 'zod';

export const curriculumItem = z
  .object({ id: z.uuid(), nameAr: z.string(), nameEn: z.string() })
  .meta({ id: 'CurriculumItem' });

export const curriculumList = z.array(curriculumItem).meta({ id: 'CurriculumList' });

/** Local wall-clock time in the workspace timezone, "HH:MM". */
export const clockTime = z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/);

export const groupSlot = z
  .object({
    // 0 = Sunday ... 6 = Saturday, as in JavaScript's getDay().
    weekday: z.int().min(0).max(6),
    startTime: clockTime,
    endTime: clockTime,
  })
  .refine((s) => s.endTime > s.startTime, { path: ['endTime'], message: 'SLOT_ENDS_BEFORE_START' })
  .meta({ id: 'GroupSlot' });

// "HH:MM" strings compare correctly as text, so no time parsing is needed.
const slotList = z
  .array(groupSlot)
  .min(1)
  .max(14)
  .superRefine((slots, ctx) => {
    slots.forEach((a, i) => {
      const clash = slots.some(
        (b, j) =>
          j < i && a.weekday === b.weekday && a.startTime < b.endTime && b.startTime < a.endTime,
      );
      if (clash) ctx.addIssue({ code: 'custom', path: [i], message: 'SLOT_OVERLAP' });
    });
  });

const capacity = z.int().min(1).max(1000).nullable();
// Integer piastres (150.50 EGP = 15050); null = no monthly charge.
const monthlyFee = z.int().min(1).max(10_000_000).nullable();

export const createGroupRequest = z
  .object({
    // Owners pick any owner or teacher membership; a teacher's groups are always their own.
    teacherMembershipId: z.uuid().optional(),
    subjectId: z.uuid(),
    gradeLevelId: z.uuid(),
    capacity: capacity.optional(),
    monthlyFeePiastres: monthlyFee.optional(),
    slots: slotList,
  })
  .meta({ id: 'CreateGroupRequest' });

export const updateGroupRequest = z
  .object({
    teacherMembershipId: z.uuid(),
    subjectId: z.uuid(),
    gradeLevelId: z.uuid(),
    capacity,
    monthlyFeePiastres: monthlyFee,
    status: z.enum(['active', 'archived']),
    // Replaces every slot of the group.
    slots: slotList,
  })
  .partial()
  .meta({ id: 'UpdateGroupRequest' });

export const group = z
  .object({
    id: z.uuid(),
    teacherMembershipId: z.uuid(),
    teacherName: z.string(),
    subject: curriculumItem,
    gradeLevel: curriculumItem,
    capacity: z.int().nullable(),
    monthlyFeePiastres: z.int().nullable(),
    status: z.enum(['active', 'archived']),
    slots: z.array(groupSlot),
    // Active enrollments, so a card can say «12/20 طالب».
    studentCount: z.int(),
  })
  .meta({ id: 'Group' });

export const groupList = z.array(group).meta({ id: 'GroupList' });

export type CurriculumItem = z.infer<typeof curriculumItem>;
export type GroupSlot = z.infer<typeof groupSlot>;
export type CreateGroupRequest = z.infer<typeof createGroupRequest>;
export type UpdateGroupRequest = z.infer<typeof updateGroupRequest>;
export type Group = z.infer<typeof group>;
