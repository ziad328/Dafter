import { ChevronLeft, ClipboardList, Pencil } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { Link, useParams } from 'react-router';
import {
  useGetCurrentWorkspaceQuery,
  useGetGroupQuery,
  useListExamsQuery,
  useListSessionsQuery,
  useListStudentsQuery,
} from '@/api/generated';
import { FormError, Skeleton } from '@/components/Field';
import { Avatar, PageHeader, Panel } from '@/components/Page';
import { Button } from '@/components/ui/button';
import { itemName, sortedSlots, weekdayName } from '@/lib/groups';
import { formatEgp } from '@/lib/money';
import { errorKey } from '@/lib/session';
import { addDays, clockLabel, dayLabel, displayTime, localDate } from '@/lib/time';

/** One group: who is in it (and who owes or hasn't activated), its next classes, its exams. */
export default function GroupPage() {
  const { t, i18n } = useTranslation();
  const lang = i18n.language;
  const { id = '' } = useParams();
  const workspace = useGetCurrentWorkspaceQuery().data;
  const tz = workspace?.timezone ?? 'Africa/Cairo';
  const canWrite = workspace?.role === 'owner' || workspace?.role === 'teacher';
  const today = localDate(new Date(), tz);
  const group = useGetGroupQuery({ id });
  const students = useListStudentsQuery({ groupId: id });
  const sessions = useListSessionsQuery({ from: today, to: addDays(today, 14) });
  const exams = useListExamsQuery({ id });

  if (group.isLoading) return <Skeleton />;
  if (group.error) return <FormError message={t(errorKey(group.error))} />;
  const g = group.data!;
  const when = sortedSlots(g)
    .map((s) => `${weekdayName(lang, s.weekday)} ${clockLabel(s.startTime, lang)}`)
    .join('، ');
  const next = (sessions.data ?? [])
    .filter((s) => s.groupId === id && s.status !== 'closed' && s.status !== 'cancelled')
    .slice(0, 3);
  const roster = students.data ?? [];

  return (
    <div className="grid gap-5">
      <PageHeader
        title={`${itemName(g.subject, lang)} · ${g.label ?? itemName(g.gradeLevel, lang)}`}
        subtitle={
          <>
            <bdi>{when}</bdi>
            {` · ${g.teacherName}`}
            {g.room && ` · ${g.room.name}`}
          </>
        }
        action={
          canWrite && (
            <Button asChild variant="outline">
              <Link to={`/groups/${id}/edit`}>
                <Pencil aria-hidden />
                {t('groups.editShort')}
              </Link>
            </Button>
          )
        }
      />

      <section className="grid gap-2" aria-labelledby="group-next">
        <h2 id="group-next" className="font-semibold">
          {t('groups.nextClasses')}
        </h2>
        <Panel className="overflow-hidden">
          {next.length === 0 ? (
            <p className="p-4 text-sm text-muted-foreground">{t('groups.noNextClasses')}</p>
          ) : (
            <ul className="divide-y">
              {next.map((s) => (
                <li key={s.id} className="flex items-center justify-between gap-3 px-4 py-2.5">
                  <span>{dayLabel(localDate(s.startsAt, tz), lang)}</span>
                  <bdi className="text-sm text-muted-foreground">
                    {displayTime(s.startsAt, tz, lang)}
                  </bdi>
                </li>
              ))}
            </ul>
          )}
        </Panel>
      </section>

      <section className="grid gap-2" aria-labelledby="group-roster">
        <h2 id="group-roster" className="font-semibold">
          {t('groups.students', { count: roster.length })}
        </h2>
        {students.isLoading ? (
          <Skeleton />
        ) : roster.length === 0 ? (
          <Panel className="p-6 text-center text-muted-foreground">{t('groups.noStudents')}</Panel>
        ) : (
          <Panel className="overflow-hidden">
            <ul className="divide-y">
              {roster.map((s) => {
                const name = lang === 'en' && s.nameEn ? s.nameEn : s.nameAr;
                return (
                  <li key={s.id}>
                    <Link
                      to={`/students/${s.id}`}
                      className="flex items-center gap-3 px-4 py-2.5 transition-colors hover:bg-ink-soft/50 focus-visible:bg-ink-soft"
                    >
                      <Avatar name={name} className="size-8 text-xs" />
                      <span className="min-w-0 flex-1 truncate font-medium">{name}</span>
                      {!s.activated && (
                        <span className="shrink-0 rounded-full bg-muted px-2 py-0.5 text-xs text-muted-foreground">
                          {t('groups.notActivated')}
                        </span>
                      )}
                      {s.balancePiastres > 0 && (
                        <bdi className="shrink-0 rounded-full bg-rose-soft px-2 py-0.5 text-xs font-medium text-rose">
                          {formatEgp(s.balancePiastres, lang)}
                        </bdi>
                      )}
                      <ChevronLeft
                        className="size-4 shrink-0 text-muted-foreground ltr:-scale-x-100"
                        aria-hidden
                      />
                    </Link>
                  </li>
                );
              })}
            </ul>
          </Panel>
        )}
      </section>

      <section className="grid gap-2" aria-labelledby="group-exams">
        <div className="flex items-center justify-between gap-2">
          <h2 id="group-exams" className="font-semibold">
            {t('exams.title')}
          </h2>
          <Button asChild variant="ghost" size="sm">
            <Link to={`/groups/${id}/exams`}>
              <ClipboardList aria-hidden />
              {t('groups.allExams')}
            </Link>
          </Button>
        </div>
        <Panel className="overflow-hidden">
          {!exams.data?.length ? (
            <p className="p-4 text-sm text-muted-foreground">{t('groups.noExams')}</p>
          ) : (
            <ul className="divide-y">
              {exams.data.slice(0, 3).map((e) => (
                <li key={e.id}>
                  <Link
                    to={`/exams/${e.id}`}
                    className="flex items-center justify-between gap-3 px-4 py-2.5 hover:bg-ink-soft/50 focus-visible:bg-ink-soft"
                  >
                    <span className="min-w-0 truncate">{e.title}</span>
                    <span className="shrink-0 text-sm text-muted-foreground">
                      {dayLabel(e.heldOn, lang)}
                    </span>
                  </Link>
                </li>
              ))}
            </ul>
          )}
        </Panel>
      </section>
    </div>
  );
}
