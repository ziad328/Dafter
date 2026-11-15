import { Injectable } from '@nestjs/common';
import { and, eq, sql } from 'drizzle-orm';
import type {
  CreateExamRequest,
  Exam,
  ExamSheet,
  SaveExamResultsRequest,
  UpdateExamRequest,
} from '@dafter/contracts';
import { examResults, exams, type Tx } from '@dafter/db';
import { AppError } from '../errors.js';
import { enqueueExamResults } from '../messages/outbox.js';
import { TenantRepository } from '../tenant.repository.js';

type ExamRow = {
  id: string;
  group_id: string;
  title: string;
  held_on: string;
  max_score: number;
  notified_at: string | Date | null;
  graded: number;
  absent: number;
  average: number | null;
};

const toExam = (r: ExamRow): Exam => ({
  id: r.id,
  groupId: r.group_id,
  title: r.title,
  heldOn: r.held_on,
  maxScore: r.max_score,
  graded: r.graded,
  absent: r.absent,
  average: r.average === null ? null : Math.round(r.average * 10) / 10,
  notifiedAt: r.notified_at === null ? null : new Date(r.notified_at).toISOString(),
});

/** Exams with their result summary; `where` filters alias `ex`. */
const summaries = async (tx: Tx, workspaceId: string, where: ReturnType<typeof sql>) =>
  (
    await tx.execute<ExamRow>(sql`
      select ex.id, ex.group_id, ex.title, to_char(ex.held_on, 'YYYY-MM-DD') as held_on,
        ex.max_score, ex.notified_at,
        (count(r.student_id) filter (where not r.absent))::int as graded,
        (count(r.student_id) filter (where r.absent))::int as absent,
        avg(r.score)::float8 as average
      from exams ex
      left join exam_results r on r.workspace_id = ex.workspace_id and r.exam_id = ex.id
      where ex.workspace_id = ${workspaceId} and ${where}
      group by ex.id
      order by ex.held_on desc, ex.created_at desc`)
  ).rows.map(toExam);

@Injectable()
export class ExamsRepository extends TenantRepository {
  list(workspaceId: string, groupId: string) {
    return this.inTenant(workspaceId, (tx) =>
      summaries(tx, workspaceId, sql`ex.group_id = ${groupId}`),
    );
  }

  /** The exam's group teacher, for the caller's scope check; undefined if unknown. */
  async owner(workspaceId: string, id: string) {
    const rows = await this.inTenant(workspaceId, (tx) =>
      tx.execute<{ teacher: string }>(sql`
        select g.teacher_membership_id as teacher from exams ex
        join groups g on g.workspace_id = ex.workspace_id and g.id = ex.group_id
        where ex.workspace_id = ${workspaceId} and ex.id = ${id}`),
    );
    return rows.rows[0]?.teacher;
  }

  async create(workspaceId: string, groupId: string, body: CreateExamRequest, userId: string) {
    return this.inTenant(workspaceId, async (tx) => {
      const [row] = await tx
        .insert(exams)
        .values({ workspaceId, groupId, ...body, createdBy: userId })
        .returning({ id: exams.id });
      return (await summaries(tx, workspaceId, sql`ex.id = ${row!.id}`))[0]!;
    });
  }

  update(workspaceId: string, id: string, body: UpdateExamRequest) {
    return this.inTenant(workspaceId, async (tx) => {
      // Lock the exam so a concurrent grid save cannot slip a higher score past the check.
      await tx.execute(
        sql`select 1 from exams where workspace_id = ${workspaceId} and id = ${id} for update`,
      );
      if (body.maxScore !== undefined) {
        const above = await tx.execute(sql`
          select 1 from exam_results where workspace_id = ${workspaceId} and exam_id = ${id}
            and score > ${body.maxScore} limit 1`);
        if (above.rows.length) throw new AppError('EXAM_SCORE_ABOVE_MAX');
      }
      if (Object.keys(body).length)
        await tx
          .update(exams)
          .set(body)
          .where(and(eq(exams.workspaceId, workspaceId), eq(exams.id, id)));
      return (await summaries(tx, workspaceId, sql`ex.id = ${id}`))[0]!;
    });
  }

  remove(workspaceId: string, id: string) {
    return this.inTenant(workspaceId, async (tx) => {
      const has = await tx.execute(
        sql`select 1 from exam_results where workspace_id = ${workspaceId} and exam_id = ${id} limit 1`,
      );
      if (has.rows.length) throw new AppError('EXAM_HAS_RESULTS');
      await tx.delete(exams).where(and(eq(exams.workspaceId, workspaceId), eq(exams.id, id)));
    });
  }

  sheet(workspaceId: string, id: string) {
    return this.inTenant(workspaceId, (tx) => this.sheetIn(tx, workspaceId, id));
  }

  /** Every active student enrolled in the group, plus anyone who already has a result. */
  private async sheetIn(tx: Tx, workspaceId: string, id: string): Promise<ExamSheet> {
    const exam = (await summaries(tx, workspaceId, sql`ex.id = ${id}`))[0]!;
    const head = await tx.execute<{
      subject_id: string;
      subject_ar: string;
      subject_en: string;
      label: string | null;
    }>(sql`
      select sub.id as subject_id, sub.name_ar as subject_ar, sub.name_en as subject_en, g.label
      from groups g join subjects sub on sub.workspace_id = g.workspace_id and sub.id = g.subject_id
      where g.workspace_id = ${workspaceId} and g.id = ${exam.groupId}`);
    const rows = await tx.execute<{
      student_id: string;
      name_ar: string;
      name_en: string | null;
      score: number | null;
      absent: boolean | null;
    }>(sql`
      select st.id as student_id, st.name_ar, st.name_en, r.score, r.absent
      from students st
      left join exam_results r on r.workspace_id = st.workspace_id and r.exam_id = ${id}
        and r.student_id = st.id
      where st.workspace_id = ${workspaceId} and (r.student_id is not null or (
        st.status = 'active' and exists (select 1 from enrollments en
          where en.workspace_id = st.workspace_id and en.student_id = st.id
            and en.group_id = ${exam.groupId} and en.status = 'active')))
      order by st.name_ar, st.id`);
    const h = head.rows[0]!;
    return {
      exam,
      subject: { id: h.subject_id, nameAr: h.subject_ar, nameEn: h.subject_en },
      groupLabel: h.label,
      rows: rows.rows.map((r) => ({
        studentId: r.student_id,
        nameAr: r.name_ar,
        nameEn: r.name_en,
        score: r.score,
        absent: r.absent ?? false,
      })),
    };
  }

  /**
   * Replaces the exam's results with the grid, in one transaction with the exam row locked.
   * Every student needs an enrollment (any status) in the exam's group.
   */
  save(
    workspaceId: string,
    id: string,
    body: SaveExamResultsRequest,
    userId: string,
    now: Date,
  ): Promise<ExamSheet> {
    return this.inTenant(workspaceId, async (tx) => {
      const locked = await tx.execute<{ max_score: number; group_id: string }>(sql`
        select max_score, group_id from exams
        where workspace_id = ${workspaceId} and id = ${id} for update`);
      const { max_score: max, group_id: groupId } = locked.rows[0]!;
      const above = body.results.find((r) => r.score !== null && r.score > max);
      if (above) throw new AppError('EXAM_SCORE_ABOVE_MAX', { studentId: above.studentId });
      const ids = body.results.map((r) => r.studentId);
      if (ids.length) {
        const known = await tx.execute<{ student_id: string }>(sql`
          select distinct en.student_id from enrollments en
          where en.workspace_id = ${workspaceId} and en.group_id = ${groupId}
            and en.student_id = any(${`{${ids.join(',')}}`}::uuid[])`);
        const ok = new Set(known.rows.map((r) => r.student_id));
        const bad = ids.find((s) => !ok.has(s));
        if (bad) throw new AppError('EXAM_STUDENT_INVALID', { studentId: bad });
      }
      await tx
        .delete(examResults)
        .where(and(eq(examResults.workspaceId, workspaceId), eq(examResults.examId, id)));
      if (body.results.length)
        await tx.insert(examResults).values(
          body.results.map((r) => ({
            workspaceId,
            examId: id,
            studentId: r.studentId,
            score: r.score,
            absent: r.absent,
            recordedBy: userId,
            recordedAt: now,
          })),
        );
      return this.sheetIn(tx, workspaceId, id);
    });
  }

  /** Queues the parent messages and stamps notified_at once; the same transaction. */
  notify(workspaceId: string, id: string, now: Date) {
    return this.inTenant(workspaceId, async (tx) => {
      const any = await tx.execute(
        sql`select 1 from exam_results where workspace_id = ${workspaceId} and exam_id = ${id} limit 1`,
      );
      if (!any.rows.length) throw new AppError('EXAM_NOT_GRADED');
      const queued = await enqueueExamResults(tx, workspaceId, id, now);
      await tx
        .update(exams)
        .set({ notifiedAt: sql`coalesce(${exams.notifiedAt}, ${now.toISOString()}::timestamptz)` })
        .where(and(eq(exams.workspaceId, workspaceId), eq(exams.id, id)));
      return queued;
    });
  }
}
