import { zodResolver } from '@hookform/resolvers/zod';
import { useCallback, useState } from 'react';
import { useForm } from 'react-hook-form';
import { useTranslation } from 'react-i18next';
import { ChevronLeft, ChevronRight, MoreHorizontal } from 'lucide-react';
import { Link, useSearchParams } from 'react-router';
import { type MoveSessionRequest, moveSessionRequest, type Session } from '@dafter/contracts';
import {
  useCancelSessionMutation,
  useGetCurrentWorkspaceQuery,
  useListSessionsQuery,
  useMoveSessionMutation,
} from '@/api/generated';
import { Field, FormError, Skeleton } from '@/components/Field';
import { FilterChips, uniqueOptions } from '@/components/FilterChips';
import { PageHeader } from '@/components/Page';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { itemName } from '@/lib/groups';
import { errorKey } from '@/lib/session';
import { addDays, dayLabel, displayTime, localDate, localTime, weekStart } from '@/lib/time';

/** One week (Saturday first) of the workspace's sessions, in the workspace timezone. */
export default function Timetable() {
  const { t, i18n } = useTranslation();
  const lang = i18n.language;
  const workspace = useGetCurrentWorkspaceQuery();
  const tz = workspace.data?.timezone ?? 'Africa/Cairo';
  const canWrite = workspace.data?.role === 'owner' || workspace.data?.role === 'teacher';
  const [params, setParams] = useSearchParams();
  const today = localDate(new Date(), tz);
  const thisWeek = weekStart(today);
  const from = params.get('week') ?? thisWeek;
  const to = addDays(from, 6);
  const list = useListSessionsQuery({ from, to }, { skip: !workspace.data });
  // Stable, so it runs when today's section mounts, not on every refetch.
  const scrollToToday = useCallback((el: HTMLElement | null) => {
    el?.scrollIntoView({ block: 'start' });
  }, []);
  const goTo = (week: string) => setParams(week === thisWeek ? {} : { week }, { replace: true });
  // One teacher's or one grade's week (audit TT2).
  const [teacher, setTeacher] = useState('');
  const [grade, setGrade] = useState('');
  const all = list.data ?? [];

  // Sessions come sorted by start, so days come out in order. (Map.groupBy needs iOS 17.4.)
  const days = new Map<string, Session[]>();
  for (const s of all) {
    if ((teacher && s.teacherMembershipId !== teacher) || (grade && s.gradeLevel.id !== grade))
      continue;
    const date = localDate(s.startsAt, tz);
    days.set(date, [...(days.get(date) ?? []), s]);
  }

  return (
    <div className="grid gap-4">
      <PageHeader title={t('timetable.title')} />
      <nav
        className="flex items-center justify-between gap-2 rounded-2xl border bg-card p-2 shadow-card"
        aria-label={t('timetable.title')}
      >
        <Button variant="ghost" size="sm" onClick={() => goTo(addDays(from, -7))}>
          <ChevronRight aria-hidden className="ltr:-scale-x-100" />
          {t('timetable.prevWeek')}
        </Button>
        {from !== thisWeek && (
          <Button variant="ghost" size="sm" onClick={() => goTo(thisWeek)}>
            {t('timetable.thisWeek')}
          </Button>
        )}
        <Button variant="ghost" size="sm" onClick={() => goTo(addDays(from, 7))}>
          {t('timetable.nextWeek')}
          <ChevronLeft aria-hidden className="ltr:-scale-x-100" />
        </Button>
      </nav>
      <FilterChips
        label={t('groups.teacher')}
        value={teacher}
        onChange={setTeacher}
        options={uniqueOptions(
          all.map((s) => ({ value: s.teacherMembershipId, label: s.teacherName })),
        )}
      />
      <FilterChips
        label={t('groups.gradeLevel')}
        value={grade}
        onChange={setGrade}
        options={uniqueOptions(
          all.map((s) => ({ value: s.gradeLevel.id, label: itemName(s.gradeLevel, lang) })),
        )}
      />
      <FormError message={list.error && t(errorKey(list.error))} />
      {list.isLoading || !workspace.data ? (
        <Skeleton />
      ) : days.size === 0 ? (
        <p className="text-sm text-muted-foreground">{t('timetable.empty')}</p>
      ) : (
        [...days].map(([date, sessions]) => (
          <section
            key={date}
            className="grid scroll-mt-4 gap-2"
            // Today's sessions are what staff open the timetable for, so start there.
            ref={date === today ? scrollToToday : undefined}
          >
            <h2 className="flex items-center gap-2 text-sm font-semibold text-muted-foreground">
              {dayLabel(date, lang)}
              {date === today && (
                <span className="rounded-full bg-ink px-2 py-0.5 text-xs text-primary-foreground">
                  {t('nav.today')}
                </span>
              )}
            </h2>
            {sessions.map((s) => (
              <SessionCard key={s.id} session={s} tz={tz} canWrite={canWrite} />
            ))}
          </section>
        ))
      )}
    </div>
  );
}

function SessionCard({
  session: s,
  tz,
  canWrite,
}: {
  session: Session;
  tz: string;
  canWrite: boolean;
}) {
  const { t, i18n } = useTranslation();
  const lang = i18n.language;
  const [mode, setMode] = useState<'view' | 'menu' | 'confirm' | 'move'>('view');
  const [cancel, cancelled] = useCancelSessionMutation();
  const editable = canWrite && s.status === 'scheduled';

  return (
    <Card className="gap-3 py-4">
      <CardHeader className="px-4">
        <CardTitle className="flex flex-wrap items-baseline justify-between gap-2">
          <h3>{`${itemName(s.subject, lang)} · ${itemName(s.gradeLevel, lang)}`}</h3>
          <span className="flex items-center gap-1">
            <bdi className="text-sm font-normal text-muted-foreground">
              {`${displayTime(s.startsAt, tz, lang)} – ${displayTime(s.endsAt, tz, lang)}`}
            </bdi>
            {/* Move and cancel wait behind one menu, so a busy card has no stray "cancel" tap. */}
            {editable && (
              <Button
                variant="ghost"
                size="icon-sm"
                aria-label={t('timetable.actions')}
                aria-expanded={mode === 'menu'}
                onClick={() => setMode(mode === 'menu' ? 'view' : 'menu')}
              >
                <MoreHorizontal aria-hidden />
              </Button>
            )}
          </span>
        </CardTitle>
        <CardDescription>
          {s.teacherName}
          {s.status !== 'scheduled' && ` · ${t(`timetable.status.${s.status}`)}`}
          {s.moved && ` · ${t('timetable.moved')}`}
        </CardDescription>
      </CardHeader>
      {startable(s, tz) && (
        <CardContent className="px-4">
          <Button asChild size="sm">
            <Link to={`/sessions/${s.id}/live`}>{t('timetable.start')}</Link>
          </Button>
        </CardContent>
      )}
      {editable && mode !== 'view' && (
        <CardContent className="grid gap-3 px-4">
          <FormError message={cancelled.error && t(errorKey(cancelled.error))} />
          {mode === 'menu' && (
            <div className="flex gap-2">
              <Button variant="outline" size="sm" onClick={() => setMode('move')}>
                {t('timetable.move')}
              </Button>
              <Button variant="ghost" size="sm" onClick={() => setMode('confirm')}>
                {t('timetable.cancel')}
              </Button>
            </div>
          )}
          {mode === 'confirm' && (
            <div className="flex gap-2">
              <Button
                variant="destructive"
                size="sm"
                disabled={cancelled.isLoading}
                onClick={() => void cancel({ id: s.id })}
              >
                {t('timetable.confirmCancel')}
              </Button>
              <Button variant="ghost" size="sm" onClick={() => setMode('view')}>
                {t('timetable.keep')}
              </Button>
            </div>
          )}
          {mode === 'move' && <MoveForm session={s} tz={tz} onDone={() => setMode('view')} />}
        </CardContent>
      )}
    </Card>
  );
}

function MoveForm({
  session: s,
  tz,
  onDone,
}: {
  session: Session;
  tz: string;
  onDone: () => void;
}) {
  const { t } = useTranslation();
  const [move, moved] = useMoveSessionMutation();
  const { register, handleSubmit, formState } = useForm<MoveSessionRequest>({
    resolver: zodResolver(moveSessionRequest),
    defaultValues: {
      date: localDate(s.startsAt, tz),
      startTime: localTime(s.startsAt, tz),
      endTime: localTime(s.endsAt, tz),
    },
  });
  const { errors } = formState;
  const onSubmit = handleSubmit(async (body) => {
    const res = await move({ id: s.id, moveSessionRequest: body });
    if (res.data) onDone();
  });

  return (
    <form onSubmit={onSubmit} noValidate className="grid gap-3">
      <Field
        label={t('timetable.date')}
        type="date"
        dir="ltr"
        error={errors.date && t('form.invalid.date')}
        {...register('date')}
      />
      <div className="grid grid-cols-2 gap-2">
        <Field
          label={t('timetable.start')}
          type="time"
          dir="ltr"
          error={errors.startTime && t('form.invalid.slot')}
          {...register('startTime')}
        />
        <Field
          label={t('timetable.end')}
          type="time"
          dir="ltr"
          error={
            errors.endTime &&
            t(
              errors.endTime.message === 'SLOT_ENDS_BEFORE_START'
                ? 'form.invalid.slotOrder'
                : 'form.invalid.slot',
            )
          }
          {...register('endTime')}
        />
      </div>
      <FormError message={moved.error && t(errorKey(moved.error))} />
      <div className="flex gap-2">
        <Button type="submit" size="sm" disabled={moved.isLoading}>
          {t('timetable.save')}
        </Button>
        <Button type="button" variant="ghost" size="sm" onClick={onDone}>
          {t('timetable.close')}
        </Button>
      </div>
    </form>
  );
}

/** Today's scheduled or already open sessions can be started (or rejoined) from the card. */
const startable = (s: Session, tz: string) =>
  (s.status === 'scheduled' || s.status === 'open') &&
  localDate(s.startsAt, tz) === localDate(new Date(), tz);
