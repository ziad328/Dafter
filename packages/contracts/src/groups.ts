import * as z from 'zod';
import { roomRef } from './rooms.js';

export const curriculumItem = z
  .object({ id: z.uuid(), nameAr: z.string(), nameEn: z.string() })
  .meta({ id: 'CurriculumItem' });

/** A subject or grade level in the workspace's own curriculum, with whether it can still be picked. */
export const curriculumEntry = z
  .object({
    id: z.uuid(),
    nameAr: z.string(),
    nameEn: z.string(),
    status: z.enum(['active', 'archived']),
  })
  .meta({ id: 'CurriculumEntry' });

export const curriculumList = z.array(curriculumEntry).meta({ id: 'CurriculumList' });

const curriculumName = z.string().trim().min(1).max(60);

/** A new subject or grade level goes to the end of the list; the English name defaults to the Arabic. */
export const createCurriculumRequest = z
  .object({ nameAr: curriculumName, nameEn: curriculumName.optional() })
  .meta({ id: 'CreateCurriculumRequest' });

/** An archived item stays on the groups and students that use it, but can't be picked again. */
export const updateCurriculumRequest = z
  .object({
    nameAr: curriculumName,
    nameEn: curriculumName,
    status: z.enum(['active', 'archived']),
  })
  .partial()
  .meta({ id: 'UpdateCurriculumRequest' });

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
// A short name that tells two groups of the same subject and grade apart («مجموعة أ», «الصباحية»).
const label = z.string().trim().min(1).max(40).nullable();
// Integer piastres (150.50 EGP = 15050); null = no monthly charge.
const monthlyFee = z.int().min(1).max(10_000_000).nullable();

export const createGroupRequest = z
  .object({
    // Owners pick any owner or teacher membership; a teacher's groups are always their own.
    teacherMembershipId: z.uuid().optional(),
    subjectId: z.uuid(),
    gradeLevelId: z.uuid(),
    label: label.optional(),
    capacity: capacity.optional(),
    monthlyFeePiastres: monthlyFee.optional(),
    // An active room of the workspace; its other groups' slots must not overlap (ROOM_BOOKED).
    roomId: z.uuid().nullable().optional(),
    slots: slotList,
    // Save even when the teacher has another group at an overlapping time (they confirmed
    // TEACHER_BOOKED).
    force: z.boolean().optional(),
  })
  .meta({ id: 'CreateGroupRequest' });

export const updateGroupRequest = z
  .object({
    teacherMembershipId: z.uuid(),
    subjectId: z.uuid(),
    gradeLevelId: z.uuid(),
    label,
    capacity,
    monthlyFeePiastres: monthlyFee,
    // Also moves the group's future scheduled sessions to the new room.
    roomId: z.uuid().nullable(),
    status: z.enum(['active', 'archived']),
    // Replaces every slot of the group.
    slots: slotList,
    // Save even when the teacher has another group at an overlapping time.
    force: z.boolean(),
  })
  .partial()
  .meta({ id: 'UpdateGroupRequest' });

export const group = z
  .object({
    id: z.uuid(),
    teacherMembershipId: z.uuid(),
    teacherName: z.string(),
    // The teacher was removed from the workspace: the group needs a new one.
    teacherRemoved: z.boolean(),
    subject: curriculumItem,
    gradeLevel: curriculumItem,
    label: z.string().nullable(),
    capacity: z.int().nullable(),
    monthlyFeePiastres: z.int().nullable(),
    room: roomRef.nullable(),
    status: z.enum(['active', 'archived']),
    slots: z.array(groupSlot),
    // Active enrollments, so a card can say «12/20 طالب».
    studentCount: z.int(),
  })
  .meta({ id: 'Group' });

export const groupList = z.array(group).meta({ id: 'GroupList' });

export type CurriculumItem = z.infer<typeof curriculumItem>;
export type CurriculumEntry = z.infer<typeof curriculumEntry>;
export type CreateCurriculumRequest = z.infer<typeof createCurriculumRequest>;
export type UpdateCurriculumRequest = z.infer<typeof updateCurriculumRequest>;
export type GroupSlot = z.infer<typeof groupSlot>;
export type CreateGroupRequest = z.infer<typeof createGroupRequest>;
export type UpdateGroupRequest = z.infer<typeof updateGroupRequest>;
export type Group = z.infer<typeof group>;
