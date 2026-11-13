import { and, eq, sql } from 'drizzle-orm';
// Script-only import (devDependency): the shared normalizer fills name_search (rule 6).
import { normalizeArabic } from '@dafter/contracts';
import { createDb } from '../client.js';
import { runMigrations } from '../migrate.js';
import {
  enrollments,
  gradeLevels,
  groups,
  groupSlots,
  guardians,
  memberships,
  studentGuardians,
  students,
  subjects,
  users,
  workspaces,
} from '../schema.js';
import { seed } from '../seed.js';
import { databaseUrl } from './env.js';

const CENTER = 'سنتر النور';
const TZ = 'Africa/Cairo';

// [subject, weekday (0 = Sunday), start, end, monthly fee in piastres]
const GROUPS: [string, number[], string, string, number][] = [
  ['الفيزياء', [6, 2], '16:00', '17:30', 25000],
  ['الرياضيات', [0, 3], '18:00', '19:30', 30000],
  ['الكيمياء', [1, 4], '15:00', '16:30', 25000],
];

// [Arabic name, English name, guardian phone, guardian name, guardian locale, group indexes]
// Same phone = siblings sharing one guardian (and one absence message).
const STUDENTS: [string, string, string, string, 'ar' | 'en', number[]][] = [
  ['أحمد خالد', 'Ahmed Khaled', '01099990001', 'خالد إبراهيم', 'ar', [0, 1]],
  ['مريم خالد', 'Mariam Khaled', '01099990001', 'خالد إبراهيم', 'ar', [0, 2]],
  ['يوسف عمرو', 'Youssef Amr', '01099990002', 'عمرو سعيد', 'ar', [0, 1, 2]],
  ['سلمى طارق', 'Salma Tarek', '01099990003', 'هبة مصطفى', 'en', [0]],
  ['عمر حسام', 'Omar Hossam', '01099990004', 'حسام فؤاد', 'ar', [1]],
  ['نور الهدى سامي', 'Nour Elhoda Samy', '01099990005', 'سامي عبد الله', 'ar', [1, 2]],
  ['كريم وليد', 'Karim Walid', '01099990006', 'منال رشاد', 'ar', [0, 1]],
  ['ليلى وليد', 'Laila Walid', '01099990006', 'منال رشاد', 'ar', [1]],
  ['آدم شريف', 'Adam Sherif', '01099990007', 'شريف نبيل', 'en', [2]],
  ['جنى أيمن', 'Jana Ayman', '01099990008', 'أيمن حمدي', 'ar', [0, 2]],
  ['زياد محمد', 'Ziad Mohamed', '01099990009', 'محمد عادل', 'ar', [1]],
  ['فرح إسلام', 'Farah Eslam', '01099990010', 'إسلام جمال', 'ar', [0, 1, 2]],
];

/**
 * The live demo: migrations, the base seed (staff and workspaces) when missing, then groups with
 * weekly slots, students with guardians (two sibling pairs) and two past weeks of closed sessions
 * with attendance. Safe to rerun: it skips when the center already has groups. Future sessions and
 * monthly charges come from the worker's jobs after the API starts.
 */
async function main() {
  const url = databaseUrl();
  await runMigrations(url);
  const { db, pool } = createDb(url);
  try {
    let [center] = await db.select().from(workspaces).where(eq(workspaces.nameAr, CENTER));
    if (!center) {
      await seed(url);
      [center] = await db.select().from(workspaces).where(eq(workspaces.nameAr, CENTER));
    }
    const ws = center!.id;
    if (
      (await db.select({ id: groups.id }).from(groups).where(eq(groups.workspaceId, ws))).length
    ) {
      console.log('Demo data already there; nothing to do');
      return;
    }

    await db.transaction(async (tx) => {
      const [teacher] = await tx
        .select({ membershipId: memberships.id, userId: users.id })
        .from(memberships)
        .innerJoin(users, eq(users.id, memberships.userId))
        .where(and(eq(memberships.workspaceId, ws), eq(memberships.role, 'teacher')));
      const [grade] = await tx
        .select({ id: gradeLevels.id })
        .from(gradeLevels)
        .where(and(eq(gradeLevels.workspaceId, ws), eq(gradeLevels.nameAr, 'الصف الثالث الثانوي')));
      const subjectIds = new Map(
        (
          await tx
            .select({ id: subjects.id, nameAr: subjects.nameAr })
            .from(subjects)
            .where(eq(subjects.workspaceId, ws))
        ).map((s) => [s.nameAr, s.id]),
      );

      const groupIds: string[] = [];
      for (const [subject, days, start, end, fee] of GROUPS) {
        const [g] = await tx
          .insert(groups)
          .values({
            workspaceId: ws,
            teacherMembershipId: teacher!.membershipId,
            subjectId: subjectIds.get(subject)!,
            gradeLevelId: grade!.id,
            capacity: 30,
            monthlyFeePiastres: fee,
          })
          .returning({ id: groups.id });
        groupIds.push(g!.id);
        await tx.insert(groupSlots).values(
          days.map((weekday) => ({
            workspaceId: ws,
            groupId: g!.id,
            weekday,
            startTime: start,
            endTime: end,
          })),
        );
      }

      const joinedAt = sql`now() - interval '30 days'`;
      for (const [nameAr, nameEn, phone, guardianName, locale, inGroups] of STUDENTS) {
        const [s] = await tx
          .insert(students)
          .values({
            workspaceId: ws,
            nameAr,
            nameEn,
            nameSearch: normalizeArabic(`${nameAr} ${nameEn}`),
            gradeLevelId: grade!.id,
          })
          .returning({ id: students.id });
        const [g] = await tx
          .insert(guardians)
          .values({ workspaceId: ws, phone, name: guardianName, preferredLocale: locale })
          .onConflictDoUpdate({
            target: [guardians.workspaceId, guardians.phone],
            set: { name: sql`excluded.name` },
          })
          .returning({ id: guardians.id });
        await tx
          .insert(studentGuardians)
          .values({ workspaceId: ws, studentId: s!.id, guardianId: g!.id, isPrimary: true });
        await tx.insert(enrollments).values(
          inGroups.map((i) => ({
            workspaceId: ws,
            studentId: s!.id,
            groupId: groupIds[i]!,
            joinedAt,
          })),
        );
      }

      // Two past weeks of closed sessions, local times in the workspace timezone.
      await tx.execute(sql`
        insert into sessions (workspace_id, group_id, slot_starts_at, starts_at, ends_at, status, opened_at, closed_by)
        select ${ws}, s.group_id, x.st, x.st, x.en, 'closed', x.st, ${teacher!.userId}
        from group_slots s
        cross join generate_series(
          (now() at time zone ${TZ})::date - 14, (now() at time zone ${TZ})::date - 1, interval '1 day') d
        cross join lateral (select (d::date + s.start_time) at time zone ${TZ} as st,
                                   (d::date + s.end_time) at time zone ${TZ} as en) x
        where s.workspace_id = ${ws} and extract(dow from d) = s.weekday`);
      // Mostly present, some late, some absent; the same student and session always get the same.
      await tx.execute(sql`
        insert into attendance_records (workspace_id, session_id, student_id, status, method, recorded_by, recorded_at)
        select ${ws}, se.id, e.student_id, v.status::attendance_status, v.method::attendance_method,
               case when v.status = 'absent' then null else ${teacher!.userId}::uuid end,
               se.starts_at + v.after
        from sessions se
        join enrollments e on e.workspace_id = se.workspace_id and e.group_id = se.group_id
        cross join lateral (select abs(hashtext(se.id::text || e.student_id::text)) % 10 as r) h
        cross join lateral (select
            case when h.r < 8 then 'present' when h.r = 8 then 'late' else 'absent' end as status,
            case when h.r = 9 then 'auto_close' else 'manual' end as method,
            case when h.r = 8 then interval '20 minutes'
                 when h.r = 9 then se.ends_at - se.starts_at
                 else interval '3 minutes' end as after) v
        where se.workspace_id = ${ws} and se.status = 'closed'`);
    });
    console.log('Seeded the demo center: 3 groups, 12 students, 2 weeks of attendance');
  } finally {
    await pool.end();
  }
}

main().catch((err: unknown) => {
  console.error(err);
  process.exit(1);
});
