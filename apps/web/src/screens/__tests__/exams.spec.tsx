import { screen, within } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { fail, fx, http, route, sent, server } from '@/test/server';
import { renderAt, tr } from '@/test/render';

const call = (c: string) => sent.find((s) => s.call === c);
const sheetUrl = `/exams/${fx.exam.id}`;

describe('exams', () => {
  it('links every group card to its exams', async () => {
    const { user, router } = await renderAt('/groups');
    await user.click((await screen.findAllByRole('link', { name: tr('exams.title') }))[0]!);
    expect(router.state.location.pathname).toBe(`/groups/${fx.groups[0]!.id}/exams`);
  });

  it('lists the exams of a group and creates one, then opens its grid', async () => {
    const { user, router } = await renderAt(`/groups/${fx.group.id}/exams`);
    expect(await screen.findByText('امتحان قديم')).toBeVisible();
    expect(screen.getByText(tr('exams.notGraded'))).toBeVisible();
    expect(screen.getByText(tr('exams.averageOf', { average: 18, max: 20 }))).toBeVisible();

    await user.click(screen.getByRole('button', { name: tr('exams.create') }));
    expect(await screen.findByText(tr('form.invalid.examTitle'))).toBeVisible();
    await user.type(screen.getByLabelText(tr('exams.examTitle')), 'امتحان الشهر');
    await user.clear(screen.getByLabelText(tr('exams.maxScore')));
    await user.type(screen.getByLabelText(tr('exams.maxScore')), '30');
    await user.click(screen.getByRole('button', { name: tr('exams.create') }));
    await expect.poll(() => router.state.location.pathname).toBe(sheetUrl);
    expect(call(`POST /api/v1/groups/${fx.group.id}/exams`)?.body).toMatchObject({
      title: 'امتحان الشهر',
      maxScore: 30,
    });
  });

  it('shows an empty exams list, in English', async () => {
    server.use(http.get(route('groups/:id/exams'), () => Response.json([])));
    await renderAt(`/groups/${fx.group.id}/exams`, { lang: 'en' });
    expect(await screen.findByText('No exams yet.')).toBeVisible();
  });

  it('shows a group the caller cannot see as not found', async () => {
    server.use(http.get(route('groups/:id'), fail('GROUP_NOT_FOUND', 404)));
    await renderAt(`/groups/${fx.group.id}/exams`);
    expect(await screen.findByText(tr('errors.GROUP_NOT_FOUND'))).toBeVisible();
  });

  it('grades the grid, blocks a score above the max, and saves', async () => {
    const { user } = await renderAt(sheetUrl);
    const summary = await screen.findByTestId('exam-summary');
    expect(within(summary).getAllByText('18/20')).toHaveLength(3);

    const save = screen.getByRole('button', { name: tr('exams.save') });
    expect(save).toBeDisabled();
    const omar = screen.getByLabelText(tr('exams.scoreFor', { name: 'عمر خالد' }));
    await user.type(omar, '25');
    expect(screen.getByText(tr('errors.EXAM_SCORE_ABOVE_MAX'))).toBeVisible();
    expect(save).toBeDisabled();
    expect(screen.getByRole('button', { name: tr('exams.notify') })).toBeDisabled();
    await user.clear(omar);
    await user.type(omar, '12');
    // Absent switches off the score of the first student.
    const first = fx.examSheet.rows[0]!.nameAr;
    await user.click(screen.getByLabelText(tr('exams.absentFor', { name: first })));
    expect(screen.getByLabelText(tr('exams.scoreFor', { name: first }))).toBeDisabled();
    await user.click(save);
    await expect
      .poll(() => call(`PUT /api/v1/exams/${fx.exam.id}/results`)?.body)
      .toEqual({
        results: [
          { studentId: fx.examSheet.rows[0]!.studentId, score: null, absent: true },
          { studentId: fx.examSheet.rows[1]!.studentId, score: null, absent: true },
          { studentId: fx.examSheet.rows[2]!.studentId, score: 12, absent: false },
        ],
      });
  });

  it('sends saved results to parents', async () => {
    const { user } = await renderAt(sheetUrl);
    await user.click(await screen.findByRole('button', { name: tr('exams.notify') }));
    expect(await screen.findByRole('status')).toHaveTextContent(tr('exams.queued', { count: 2 }));
    expect(call(`POST /api/v1/exams/${fx.exam.id}/notify`)).toBeDefined();
  });

  it('shows English names, an earlier send, and server errors', async () => {
    server.use(
      http.get(route('exams/:id'), () =>
        Response.json({
          ...fx.examSheet,
          groupLabel: 'مجموعة أ',
          exam: { ...fx.exam, notifiedAt: '2026-11-21T13:00:00Z' },
        }),
      ),
      http.post(route('exams/:id/notify'), fail('EXAM_NOT_GRADED', 409)),
    );
    const { user } = await renderAt(sheetUrl, { lang: 'en' });
    expect(await screen.findByText('Omar')).toBeVisible();
    expect(screen.getByText(/· مجموعة أ ·/)).toBeVisible();
    expect(screen.getByText(tr('exams.alreadySent'))).toBeVisible();
    await user.click(screen.getByRole('button', { name: tr('exams.notify') }));
    expect(await screen.findByText(tr('errors.EXAM_NOT_GRADED'))).toBeVisible();
  });

  it('deletes an exam without results after a confirm', async () => {
    const exam = { ...fx.exam, graded: 0, absent: 0, average: null };
    const rows = fx.examSheet.rows.map((r) => ({ ...r, score: null, absent: false }));
    server.use(http.get(route('exams/:id'), () => Response.json({ ...fx.examSheet, exam, rows })));
    const { user, router } = await renderAt(sheetUrl);
    expect(await screen.findByRole('button', { name: tr('exams.notify') })).toBeDisabled();
    expect(screen.queryByTestId('exam-summary')).toBeNull();
    await user.click(screen.getByRole('button', { name: tr('exams.delete') }));
    await user.click(screen.getByRole('button', { name: tr('exams.confirmDelete') }));
    await expect
      .poll(() => router.state.location.pathname)
      .toBe(`/groups/${fx.exam.groupId}/exams`);
  });

  it('keeps the page when delete fails, and shows a group with no students', async () => {
    const exam = { ...fx.exam, graded: 0, absent: 0 };
    server.use(
      http.get(route('exams/:id'), () => Response.json({ ...fx.examSheet, exam, rows: [] })),
      http.delete(route('exams/:id'), fail('EXAM_HAS_RESULTS', 409)),
    );
    const { user, router } = await renderAt(sheetUrl);
    expect(await screen.findByText(tr('exams.noStudents'))).toBeVisible();
    await user.click(screen.getByRole('button', { name: tr('exams.delete') }));
    await user.click(screen.getByRole('button', { name: tr('exams.confirmDelete') }));
    expect(await screen.findByText(tr('errors.EXAM_HAS_RESULTS'))).toBeVisible();
    expect(router.state.location.pathname).toBe(sheetUrl);
  });

  it('shows a missing exam as not found', async () => {
    server.use(http.get(route('exams/:id'), fail('EXAM_NOT_FOUND', 404)));
    await renderAt(sheetUrl);
    expect(await screen.findByText(tr('errors.EXAM_NOT_FOUND'))).toBeVisible();
  });
});
