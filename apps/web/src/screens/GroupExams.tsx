import { createExamRequest, type CreateExamRequest } from '@dafter/contracts';
import { zodResolver } from '@hookform/resolvers/zod';
import { ClipboardList } from 'lucide-react';
import { useForm } from 'react-hook-form';
import { useTranslation } from 'react-i18next';
import { Link, useNavigate, useParams } from 'react-router';
import {
  useCreateExamMutation,
  useGetCurrentWorkspaceQuery,
  useGetGroupQuery,
  useListExamsQuery,
} from '@/api/generated';
import { Field, FormError, Skeleton } from '@/components/Field';
import { PageHeader, Panel } from '@/components/Page';
import { Button } from '@/components/ui/button';
import { itemName } from '@/lib/groups';
import { errorKey } from '@/lib/session';
import { dayLabel, localDate } from '@/lib/time';

/** A group's exams, newest first, and the form for a new one (/groups/:id/exams). */
export default function GroupExams() {
  const { t, i18n } = useTranslation();
  const lang = i18n.language;
  const { id = '' } = useParams();
  const navigate = useNavigate();
  const group = useGetGroupQuery({ id });
  const exams = useListExamsQuery({ id });
  const tz = useGetCurrentWorkspaceQuery().data?.timezone ?? 'Africa/Cairo';
  const [create, created] = useCreateExamMutation();
  const { register, handleSubmit, formState } = useForm<CreateExamRequest>({
    resolver: zodResolver(createExamRequest),
    defaultValues: { title: '', heldOn: localDate(new Date(), tz), maxScore: 20 },
  });
  const { errors } = formState;

  if (group.isLoading || exams.isLoading) return <Skeleton />;
  if (group.error) return <FormError message={t(errorKey(group.error))} />;
  const g = group.data!;
  const onSubmit = handleSubmit(async (body) => {
    const res = await create({ id, createExamRequest: body });
    if (res.data) void navigate(`/exams/${res.data.id}`);
  });

  return (
    <div className="grid gap-5">
      <PageHeader
        title={t('exams.title')}
        subtitle={`${itemName(g.subject, lang)} · ${itemName(g.gradeLevel, lang)}${g.label ? ` · ${g.label}` : ''}`}
      />
      <Panel className="p-5">
        <form onSubmit={onSubmit} noValidate className="grid gap-4">
          <h2 className="font-semibold">{t('exams.new')}</h2>
          <Field
            label={t('exams.examTitle')}
            maxLength={100}
            error={errors.title && t('form.invalid.examTitle')}
            {...register('title')}
          />
          {/* Stacked on phones: the native date field is too wide for half of 375 px (audit 3 E1). */}
          <div className="grid gap-3 sm:grid-cols-2">
            <Field
              label={t('exams.heldOn')}
              type="date"
              error={errors.heldOn && t('form.invalid.date')}
              {...register('heldOn')}
            />
            <Field
              label={t('exams.maxScore')}
              type="number"
              inputMode="numeric"
              dir="ltr"
              error={errors.maxScore && t('form.invalid.maxScore')}
              {...register('maxScore', { valueAsNumber: true })}
            />
          </div>
          <FormError message={created.error && t(errorKey(created.error))} />
          <Button type="submit" disabled={created.isLoading}>
            {t('exams.create')}
          </Button>
        </form>
      </Panel>
      <FormError message={exams.error && t(errorKey(exams.error))} />
      {exams.data?.length === 0 && (
        <Panel className="p-8 text-center text-muted-foreground">{t('exams.empty')}</Panel>
      )}
      <ul className="grid gap-3">
        {exams.data?.map((e) => (
          <li key={e.id}>
            <Link
              to={`/exams/${e.id}`}
              className="flex items-center gap-3 rounded-2xl border bg-card p-4 shadow-card hover:border-ink/40 focus-visible:ring-2"
            >
              <ClipboardList className="size-5 shrink-0 text-ink" aria-hidden />
              <span className="grid min-w-0 flex-1">
                <span className="truncate font-medium">{e.title}</span>
                <span className="text-sm text-muted-foreground">{dayLabel(e.heldOn, lang)}</span>
              </span>
              <span className="shrink-0 text-sm">
                {e.average === null ? (
                  <span className="text-muted-foreground">{t('exams.notGraded')}</span>
                ) : (
                  <bdi>{t('exams.averageOf', { average: e.average, max: e.maxScore })}</bdi>
                )}
              </span>
            </Link>
          </li>
        ))}
      </ul>
    </div>
  );
}
