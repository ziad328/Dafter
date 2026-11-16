import { normalizeArabic } from '@dafter/contracts';
import { BookOpen, ClipboardList, Plus, Users } from 'lucide-react';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Link } from 'react-router';
import { useGetCurrentWorkspaceQuery, useListGroupsQuery } from '@/api/generated';
import { FormError, Skeleton } from '@/components/Field';
import { FilterPicker, uniqueOptions } from '@/components/FilterChips';
import { PageHeader, Panel } from '@/components/Page';
import { Button } from '@/components/ui/button';
import { itemName, sortedSlots, weekdayName } from '@/lib/groups';
import { formatEgp } from '@/lib/money';
import { errorKey } from '@/lib/session';
import { clockLabel } from '@/lib/time';
import { cn } from '@/lib/utils';

export default function Groups() {
  const { t, i18n } = useTranslation();
  const lang = i18n.language;
  const list = useListGroupsQuery();
  const role = useGetCurrentWorkspaceQuery().data?.role;
  // Assistants read their teachers' groups but never edit them.
  const canWrite = role === 'owner' || role === 'teacher';
  // A center has hundreds of groups: narrow by teacher, grade or text (audit G2).
  const [teacher, setTeacher] = useState('');
  const [grade, setGrade] = useState('');
  const [q, setQ] = useState('');

  if (list.isLoading) return <Skeleton />;
  const all = list.data ?? [];
  const needle = normalizeArabic(q.trim()).toLowerCase();
  const shown = all.filter(
    (g) =>
      (!teacher || g.teacherMembershipId === teacher) &&
      (!grade || g.gradeLevel.id === grade) &&
      (!needle ||
        normalizeArabic(
          `${g.subject.nameAr} ${g.subject.nameEn} ${g.gradeLevel.nameAr} ${g.gradeLevel.nameEn} ${g.teacherName} ${g.label ?? ''}`,
        )
          .toLowerCase()
          .includes(needle)),
  );

  return (
    <div className="grid gap-5">
      <PageHeader
        title={t('groups.title')}
        action={
          canWrite && (
            <Button asChild>
              <Link to="/groups/new">
                <Plus aria-hidden />
                {t('groups.new')}
              </Link>
            </Button>
          )
        }
      />
      <FormError message={list.error && t(errorKey(list.error))} />
      {all.length > 1 && (
        <div className="grid gap-3">
          <input
            type="search"
            aria-label={t('groups.search')}
            placeholder={t('groups.search')}
            value={q}
            onChange={(e) => setQ(e.target.value)}
            className="h-11 w-full rounded-2xl border bg-card px-4 text-base shadow-card outline-none focus-visible:ring-2 focus-visible:ring-ring"
          />
          <div className="flex flex-wrap gap-2">
            <FilterPicker
              label={t('groups.teacher')}
              value={teacher}
              onChange={setTeacher}
              options={uniqueOptions(
                all.map((g) => ({ value: g.teacherMembershipId, label: g.teacherName })),
              )}
            />
            <FilterPicker
              label={t('groups.gradeLevel')}
              value={grade}
              onChange={setGrade}
              options={uniqueOptions(
                all.map((g) => ({ value: g.gradeLevel.id, label: itemName(g.gradeLevel, lang) })),
              )}
            />
          </div>
        </div>
      )}
      {(all.length === 0 || shown.length === 0) && (
        <Panel className="p-8 text-center text-muted-foreground">
          {t(all.length ? 'groups.noMatch' : 'groups.empty')}
        </Panel>
      )}
      {/* Two-line rows instead of tall cards, with exams as an icon in the row (audit 3 G2). */}
      {shown.length > 0 && (
        <Panel className="overflow-hidden">
          <ul className="divide-y">
            {shown.map((g, i) => {
              const when = sortedSlots(g)
                .map((s) => `${weekdayName(lang, s.weekday)} ${clockLabel(s.startTime, lang)}`)
                .join('، ');
              const body = (
                <>
                  <span
                    className={cn(
                      'hidden size-10 shrink-0 place-items-center rounded-xl sm:grid',
                      TONES[i % TONES.length],
                    )}
                  >
                    <BookOpen className="size-5" aria-hidden />
                  </span>
                  <span className="grid min-w-0 flex-1 gap-0.5">
                    <span className="flex min-w-0 items-center gap-2">
                      <h2 className="truncate font-semibold">
                        {itemName(g.subject, lang)}
                        <span className="font-normal text-muted-foreground">
                          {` · ${g.label ?? itemName(g.gradeLevel, lang)}`}
                        </span>
                      </h2>
                      {g.status === 'archived' && (
                        <span className="shrink-0 rounded-full bg-muted px-2 py-0.5 text-xs">
                          {t('groups.archived')}
                        </span>
                      )}
                      {/* Removed from the center: the group waits for a new teacher. */}
                      {g.teacherRemoved && (
                        <span className="shrink-0 rounded-full bg-late-soft px-2 py-0.5 text-xs font-medium text-late">
                          {t('groups.teacherRemoved')}
                        </span>
                      )}
                    </span>
                    <span className="truncate text-sm text-muted-foreground">
                      <bdi>{when}</bdi>
                      {` · ${g.teacherName}`}
                      {g.room && ` · ${g.room.name}`}
                      {g.monthlyFeePiastres !== null &&
                        ` · ${t('groups.perMonth', { fee: formatEgp(g.monthlyFeePiastres, lang) })}`}
                    </span>
                  </span>
                  <span className="flex shrink-0 items-center gap-1 text-sm text-muted-foreground">
                    <Users className="size-4" aria-hidden />
                    {g.capacity === null ? (
                      t('groups.students', { count: g.studentCount })
                    ) : (
                      <bdi>
                        {t('groups.seats', { count: g.studentCount, capacity: g.capacity })}
                      </bdi>
                    )}
                  </span>
                </>
              );
              const rowClass = 'flex min-w-0 flex-1 items-center gap-3 px-4 py-3';
              return (
                <li
                  key={g.id}
                  className="flex animate-rise items-center"
                  style={{ animationDelay: `${Math.min(i, 12) * 30}ms` }}
                >
                  {canWrite ? (
                    <Link
                      to={`/groups/${g.id}`}
                      className={cn(rowClass, 'hover:bg-ink-soft/50 focus-visible:bg-ink-soft')}
                    >
                      {body}
                    </Link>
                  ) : (
                    <div className={rowClass}>{body}</div>
                  )}
                  {/* Every role that sees the group grades its exams, assistants too. */}
                  <Button asChild variant="ghost" size="icon" className="me-2 shrink-0">
                    <Link to={`/groups/${g.id}/exams`} aria-label={t('exams.title')}>
                      <ClipboardList className="size-5 text-ink" aria-hidden />
                    </Link>
                  </Button>
                </li>
              );
            })}
          </ul>
        </Panel>
      )}
    </div>
  );
}

const TONES = [
  'bg-ink-soft text-ink',
  'bg-violet-soft text-violet',
  'bg-teal-soft text-teal',
  'bg-amber-soft text-amber',
];
