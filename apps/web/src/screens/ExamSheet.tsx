import type { ExamSheet as Sheet } from '@dafter/contracts';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Link, useNavigate, useParams } from 'react-router';
import {
  useDeleteExamMutation,
  useGetExamSheetQuery,
  useNotifyExamMutation,
  useSaveExamResultsMutation,
} from '@/api/generated';
import { FormError, Skeleton } from '@/components/Field';
import { PageHeader, Panel } from '@/components/Page';
import { Button } from '@/components/ui/button';
import { itemName } from '@/lib/groups';
import { errorKey } from '@/lib/session';
import { dayLabel } from '@/lib/time';
import { cn } from '@/lib/utils';

type Cell = { score: string; absent: boolean };

/** The grade grid of one exam (/exams/:id): enter, save, then send to parents. */
export default function ExamSheet() {
  const { t } = useTranslation();
  const { id = '' } = useParams();
  const sheet = useGetExamSheetQuery({ id });
  if (sheet.isLoading) return <Skeleton />;
  if (sheet.error) return <FormError message={t(errorKey(sheet.error))} />;
  // Keyed by the saved state, so the grid restarts from the server after each save.
  return <Grid key={JSON.stringify(sheet.data!.rows)} sheet={sheet.data!} />;
}

function Grid({ sheet }: { sheet: Sheet }) {
  const { t, i18n } = useTranslation();
  const lang = i18n.language;
  const navigate = useNavigate();
  const { exam } = sheet;
  const id = exam.id;
  const [cells, setCells] = useState<Record<string, Cell>>(() =>
    Object.fromEntries(
      sheet.rows.map((r) => [r.studentId, { score: r.score?.toString() ?? '', absent: r.absent }]),
    ),
  );
  const [save, saved] = useSaveExamResultsMutation();
  const [notify, notified] = useNotifyExamMutation();
  const [remove, removed] = useDeleteExamMutation();
  const [confirming, setConfirming] = useState(false);

  const set = (studentId: string, cell: Partial<Cell>) =>
    setCells((c) => ({ ...c, [studentId]: { ...c[studentId]!, ...cell } }));
  const invalid = (c: Cell) =>
    !c.absent &&
    c.score !== '' &&
    !(Number.isInteger(+c.score) && +c.score >= 0 && +c.score <= exam.maxScore);
  const bad = Object.values(cells).some(invalid);
  const dirty = sheet.rows.some(
    (r) =>
      cells[r.studentId]!.absent !== r.absent ||
      cells[r.studentId]!.score !== (r.score?.toString() ?? ''),
  );
  const recorded = exam.graded + exam.absent;
  const scores = sheet.rows.flatMap((r) => (r.score === null ? [] : [r.score]));

  const onSave = () =>
    save({
      id,
      saveExamResultsRequest: {
        results: Object.entries(cells)
          .filter(([, c]) => c.absent || c.score !== '')
          .map(([studentId, c]) => ({
            studentId,
            score: c.absent ? null : Number(c.score),
            absent: c.absent,
          })),
      },
    });
  const error = saved.error ?? notified.error ?? removed.error;

  return (
    <div className="grid gap-5">
      <PageHeader
        title={exam.title}
        subtitle={`${itemName(sheet.subject, lang)}${sheet.groupLabel ? ` · ${sheet.groupLabel}` : ''} · ${dayLabel(exam.heldOn, lang)}`}
        action={
          <Button variant="outline" asChild>
            <Link to={`/groups/${exam.groupId}/exams`}>{t('exams.all')}</Link>
          </Button>
        }
      />
      {scores.length > 0 && (
        <dl className="grid grid-cols-3 gap-3 text-center" data-testid="exam-summary">
          {(
            [
              ['average', exam.average],
              ['highest', Math.max(...scores)],
              ['lowest', Math.min(...scores)],
            ] as const
          ).map(([key, value]) => (
            <Panel key={key} className="grid gap-1 p-3">
              <dt className="text-xs text-muted-foreground">{t(`exams.${key}`)}</dt>
              <dd className="text-xl font-bold">
                <bdi>{`${value}/${exam.maxScore}`}</bdi>
              </dd>
            </Panel>
          ))}
        </dl>
      )}
      <Panel className="p-2">
        {sheet.rows.length === 0 ? (
          <p className="p-6 text-center text-muted-foreground">{t('exams.noStudents')}</p>
        ) : (
          <ul className="divide-y">
            {sheet.rows.map((r) => {
              const c = cells[r.studentId]!;
              const name = lang === 'en' && r.nameEn ? r.nameEn : r.nameAr;
              return (
                <li key={r.studentId} className="flex items-center gap-3 px-3 py-2">
                  <span className="min-w-0 flex-1 truncate">{name}</span>
                  <input
                    aria-label={t('exams.scoreFor', { name })}
                    aria-invalid={invalid(c)}
                    type="number"
                    inputMode="numeric"
                    dir="ltr"
                    min={0}
                    max={exam.maxScore}
                    disabled={c.absent}
                    value={c.absent ? '' : c.score}
                    onChange={(e) => set(r.studentId, { score: e.target.value })}
                    className={cn(
                      'h-11 w-20 rounded-xl border bg-background px-3 text-center text-base outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:opacity-40',
                      invalid(c) && 'border-destructive',
                    )}
                  />
                  <label className="flex min-h-11 items-center gap-2 text-sm">
                    <input
                      type="checkbox"
                      className="size-5 accent-ink"
                      checked={c.absent}
                      onChange={(e) => set(r.studentId, { absent: e.target.checked })}
                      aria-label={t('exams.absentFor', { name })}
                    />
                    {t('exams.absent')}
                  </label>
                </li>
              );
            })}
          </ul>
        )}
      </Panel>
      {bad && <FormError message={t('errors.EXAM_SCORE_ABOVE_MAX')} />}
      <FormError message={error && t(errorKey(error))} />
      <div className="grid gap-3 sm:grid-cols-2">
        <Button onClick={() => void onSave()} disabled={bad || !dirty || saved.isLoading}>
          {t('exams.save')}
        </Button>
        <Button
          variant="outline"
          onClick={() => void notify({ id })}
          disabled={dirty || recorded === 0 || notified.isLoading}
        >
          {t('exams.notify')}
        </Button>
      </div>
      {notified.data && (
        <p role="status" className="text-sm text-present">
          {t('exams.queued', { count: notified.data.queued })}
        </p>
      )}
      {!notified.data && exam.notifiedAt && (
        <p className="text-sm text-muted-foreground">{t('exams.alreadySent')}</p>
      )}
      {recorded === 0 && (
        <Button
          variant={confirming ? 'destructive' : 'ghost'}
          onClick={() =>
            confirming
              ? void remove({ id })
                  .unwrap()
                  .then(() => navigate(`/groups/${exam.groupId}/exams`))
                  // The error shows from the mutation state.
                  .catch(() => {})
              : setConfirming(true)
          }
        >
          {t(confirming ? 'exams.confirmDelete' : 'exams.delete')}
        </Button>
      )}
    </div>
  );
}
