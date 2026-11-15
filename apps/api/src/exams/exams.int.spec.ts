import type { NestFastifyApplication } from '@nestjs/platform-fastify';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { and, eq } from 'drizzle-orm';
import { assistantScopes, memberships, outboxMessages } from '@dafter/db';
import { useTestDb } from '@dafter/db/testing';
import { createApp } from '../app.js';
import { FakeClock } from '../clock.js';
import { sendDueMessages } from '../jobs/send-outbox.js';
import { ConsoleProvider } from '../messages/provider.js';
import { ConsoleMailer } from '../student-auth/mailer.js';
import { fixtures } from '../testing/fixtures.js';

const testDb = useTestDb();
// Saturday 15:00 Cairo (outside quiet hours).
const clock = new FakeClock(new Date('2026-11-21T13:00:00Z'));
const mailer = new ConsoleMailer();
let app: NestFastifyApplication;
const f = fixtures(
  () => app,
  () => testDb().db,
  mailer,
);

beforeAll(async () => {
  app = await createApp({ logger: false, db: testDb().db, clock, mailer });
  await app.init();
  await app.getHttpAdapter().getInstance().ready();
});
afterAll(() => app.close());

const exam = { title: 'امتحان الشهر', heldOn: '2026-11-21', maxScore: 20 };

/** A center with two enrolled students (siblings, one guardian) and one exam. */
async function setup() {
  const c = await f.center();
  const a = await c.newStudent({ phone: '01291110001' });
  const b = await c.newStudent({ phone: '01291110001' });
  for (const id of [a, b])
    await c.owner('POST', `students/${id}/enrollments`, { groupId: c.groupId });
  const created = await c.teacher('POST', `groups/${c.groupId}/exams`, exam);
  return { c, a, b, examId: created.json().id as string, created };
}

const outbox = (workspaceId: string) =>
  testDb()
    .db.select()
    .from(outboxMessages)
    .where(
      and(eq(outboxMessages.workspaceId, workspaceId), eq(outboxMessages.trigger, 'exam_result')),
    );

describe('exams', () => {
  it('creates, grades, replaces and summarises an exam', async () => {
    const { c, a, b, examId, created } = await setup();
    expect(created.statusCode).toBe(201);
    expect(created.json()).toMatchObject({ ...exam, graded: 0, absent: 0, average: null });

    const empty = (await c.teacher('GET', `exams/${examId}`)).json();
    expect(empty.rows).toHaveLength(2);
    expect(empty.rows[0]).toMatchObject({ score: null, absent: false });

    const saved = await c.teacher('PUT', `exams/${examId}/results`, {
      results: [
        { studentId: a, score: 17, absent: false },
        { studentId: b, score: null, absent: true },
      ],
    });
    expect(saved.statusCode).toBe(200);
    expect(saved.json().exam).toMatchObject({ graded: 1, absent: 1, average: 17 });
    expect(saved.json().subject.nameAr).toBeTruthy();

    // Saving the same grid twice is the same state; a smaller grid clears the rest.
    const grid = { results: [{ studentId: a, score: 18, absent: false }] };
    await c.teacher('PUT', `exams/${examId}/results`, grid);
    const again = (await c.teacher('PUT', `exams/${examId}/results`, grid)).json();
    expect(again.exam).toMatchObject({ graded: 1, absent: 0, average: 18 });
    expect(again.rows.find((r: { studentId: string }) => r.studentId === b)).toMatchObject({
      score: null,
      absent: false,
    });

    const list = (await c.owner('GET', `groups/${c.groupId}/exams`)).json();
    expect(list).toEqual([expect.objectContaining({ id: examId, average: 18 })]);
  });

  it('rejects a score above the max, a stranger, a bad row and a max below a score', async () => {
    const { c, a, examId } = await setup();
    const put = (results: object[]) => c.teacher('PUT', `exams/${examId}/results`, { results });

    const above = await put([{ studentId: a, score: 21, absent: false }]);
    expect([above.statusCode, above.json()]).toEqual([
      400,
      { code: 'EXAM_SCORE_ABOVE_MAX', details: { studentId: a } },
    ]);
    const stranger = await c.newStudent();
    expect((await put([{ studentId: stranger, score: 1, absent: false }])).json().code).toBe(
      'EXAM_STUDENT_INVALID',
    );
    expect((await put([{ studentId: a, score: 3, absent: true }])).json().code).toBe(
      'VALIDATION_FAILED',
    );

    await put([{ studentId: a, score: 15, absent: false }]);
    const lower = await c.teacher('PATCH', `exams/${examId}`, { maxScore: 10 });
    expect(lower.json().code).toBe('EXAM_SCORE_ABOVE_MAX');
    const ok = await c.teacher('PATCH', `exams/${examId}`, { maxScore: 30, title: 'نصف الترم' });
    expect(ok.json()).toMatchObject({ maxScore: 30, title: 'نصف الترم' });
    expect((await c.teacher('PATCH', `exams/${examId}`, {})).json().maxScore).toBe(30);
  });

  it('deletes only an exam without results', async () => {
    const { c, a, examId } = await setup();
    await c.teacher('PUT', `exams/${examId}/results`, {
      results: [{ studentId: a, score: 5, absent: false }],
    });
    expect((await c.teacher('DELETE', `exams/${examId}`)).json().code).toBe('EXAM_HAS_RESULTS');
    await c.teacher('PUT', `exams/${examId}/results`, { results: [] });
    expect((await c.teacher('DELETE', `exams/${examId}`)).statusCode).toBe(204);
    expect((await c.teacher('GET', `exams/${examId}`)).json().code).toBe('EXAM_NOT_FOUND');
  });

  it('sends one merged message per guardian, once, and respects the toggle', async () => {
    const { c, a, b, examId } = await setup();
    expect((await c.teacher('POST', `exams/${examId}/notify`)).json().code).toBe('EXAM_NOT_GRADED');
    await c.teacher('PUT', `exams/${examId}/results`, {
      results: [
        { studentId: a, score: 18, absent: false },
        { studentId: b, score: null, absent: true },
      ],
    });
    const first = await c.teacher('POST', `exams/${examId}/notify`);
    expect([first.statusCode, first.json()]).toEqual([200, { queued: 1 }]);
    expect((await c.teacher('POST', `exams/${examId}/notify`)).json()).toEqual({ queued: 0 });
    expect(await outbox(c.workspaceId)).toHaveLength(1);
    const notifiedAt = (await c.teacher('GET', `exams/${examId}`)).json().exam.notifiedAt;
    expect(notifiedAt).toBe(clock.now().toISOString());

    const phone = new ConsoleProvider();
    await sendDueMessages(testDb().db, clock, phone);
    const [sent] = await outbox(c.workspaceId);
    expect(sent!.body).toContain('18/20');
    expect(sent!.body).toContain('غائب');

    // Switched off: grading another exam queues nothing.
    await c.owner('PUT', 'message-settings', {
      absence: true,
      sessionChange: true,
      examResult: false,
    });
    expect((await c.owner('GET', 'message-settings')).json().examResult).toBe(false);
    const second = (await c.teacher('POST', `groups/${c.groupId}/exams`, exam)).json().id;
    await c.teacher('PUT', `exams/${second}/results`, {
      results: [{ studentId: a, score: 1, absent: false }],
    });
    expect((await c.teacher('POST', `exams/${second}/notify`)).json()).toEqual({ queued: 0 });
  });

  it('follows group visibility: other centers, other teachers and unscoped assistants get 404', async () => {
    const { c, examId } = await setup();
    const other = await f.center();
    expect((await other.owner('GET', `exams/${examId}`)).json().code).toBe('EXAM_NOT_FOUND');
    expect((await other.owner('GET', `groups/${c.groupId}/exams`)).json().code).toBe(
      'GROUP_NOT_FOUND',
    );
    expect((await other.owner('POST', `groups/${c.groupId}/exams`, exam)).json().code).toBe(
      'GROUP_NOT_FOUND',
    );
    for (const [method, url] of [
      ['GET', `exams/${examId}`],
      ['PATCH', `exams/${examId}`],
      ['DELETE', `exams/${examId}`],
      ['PUT', `exams/${examId}/results`],
      ['POST', `exams/${examId}/notify`],
    ] as const)
      expect((await c.assistant(method, url, { results: [] })).json().code, url).toBe(
        'EXAM_NOT_FOUND',
      );

    // Scoped to the teacher, the assistant can grade.
    const role = async (r: 'assistant' | 'teacher') =>
      (
        await testDb()
          .db.select({ id: memberships.id })
          .from(memberships)
          .where(and(eq(memberships.workspaceId, c.workspaceId), eq(memberships.role, r)))
      )[0]!.id;
    await testDb()
      .db.insert(assistantScopes)
      .values({
        workspaceId: c.workspaceId,
        membershipId: await role('assistant'),
        teacherMembershipId: await role('teacher'),
      });
    expect((await c.assistant('GET', `exams/${examId}`)).statusCode).toBe(200);
    expect((await c.owner('GET', `exams/${examId}`)).statusCode).toBe(200);
  });
});

describe('GET /me/grades', () => {
  it("shows my results in every center, and nobody else's", async () => {
    const { c, a, b, examId } = await setup();
    const me = await f.activate(c.owner, a, 'grades@example.com');
    const sibling = await f.activate(c.owner, b, 'sibling@example.com');
    const get = async (token: string) =>
      (
        await app.inject({ method: 'GET', url: '/api/v1/me/grades', headers: f.bearer(token) })
      ).json();
    expect(await get(me.token)).toEqual([]);

    await c.teacher('PUT', `exams/${examId}/results`, {
      results: [
        { studentId: a, score: 19, absent: false },
        { studentId: b, score: null, absent: true },
      ],
    });
    // The same login in a second center, with an older exam.
    const d = await f.center();
    const inD = await d.newStudent();
    await d.owner('POST', `students/${inD}/enrollments`, { groupId: d.groupId });
    await f.activate(d.owner, inD, 'grades@example.com');
    const old = (
      await d.owner('POST', `groups/${d.groupId}/exams`, { ...exam, heldOn: '2026-11-01' })
    ).json().id;
    await d.owner('PUT', `exams/${old}/results`, {
      results: [{ studentId: inD, score: 12, absent: false }],
    });

    expect(await get(me.token)).toMatchObject([
      { examId, title: exam.title, heldOn: '2026-11-21', maxScore: 20, score: 19, absent: false },
      { examId: old, heldOn: '2026-11-01', score: 12 },
    ]);
    expect(await get(sibling.token)).toMatchObject([{ examId, score: null, absent: true }]);
  });
});
