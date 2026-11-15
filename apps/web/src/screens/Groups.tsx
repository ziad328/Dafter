import { normalizeArabic } from '@dafter/contracts';
import { BookOpen, ClipboardList, DoorOpen, Plus, Users } from 'lucide-react';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Link } from 'react-router';
import { useGetCurrentWorkspaceQuery, useListGroupsQuery } from '@/api/generated';
import { FormError, Skeleton } from '@/components/Field';
import { FilterPicker, uniqueOptions } from '@/components/FilterChips';
import { Avatar, PageHeader, Panel } from '@/components/Page';
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
      <ul className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
        {shown.map((g, i) => {
          const card = (
            <Panel className="grid h-full gap-4 p-5 transition-all hover:-translate-y-0.5 hover:border-ink/40">
              <div className="flex items-start gap-3">
                <span
                  className={cn(
                    'grid size-11 shrink-0 place-items-center rounded-xl',
                    TONES[i % TONES.length],
                  )}
                >
                  <BookOpen className="size-5" aria-hidden />
                </span>
                <div className="grid min-w-0">
                  <h2 className="truncate text-lg font-semibold">{itemName(g.subject, lang)}</h2>
                  <p className="truncate text-sm text-muted-foreground">
                    {itemName(g.gradeLevel, lang)}
                    {g.label && ` · ${g.label}`}
                  </p>
                </div>
                {g.status === 'archived' && (
                  <span className="ms-auto rounded-full bg-muted px-2 py-0.5 text-xs">
                    {t('groups.archived')}
                  </span>
                )}
              </div>
              <ul className="flex flex-wrap gap-2 text-sm">
                {sortedSlots(g).map((s) => (
                  <li
                    key={`${s.weekday}-${s.startTime}`}
                    className="rounded-full bg-muted px-3 py-1"
                  >
                    {`${weekdayName(lang, s.weekday)} `}
                    <bdi>{`${clockLabel(s.startTime, lang)} – ${clockLabel(s.endTime, lang)}`}</bdi>
                  </li>
                ))}
                {g.room && (
                  <li className="flex items-center gap-1 rounded-full bg-muted px-3 py-1">
                    <DoorOpen className="size-4" aria-hidden />
                    {g.room.name}
                  </li>
                )}
              </ul>
              <div className="flex items-center gap-2 border-t pt-3 text-sm">
                <Avatar name={g.teacherName} className="size-8 text-xs" />
                <span className="truncate">{g.teacherName}</span>
                {/* Removed from the center: the group waits for a new teacher. */}
                {g.teacherRemoved && (
                  <span className="shrink-0 rounded-full bg-late-soft px-2 py-0.5 text-xs font-medium text-late">
                    {t('groups.teacherRemoved')}
                  </span>
                )}
                {/* Students and fee tell apart a teacher's groups of one subject (audit G1). */}
                <span className="ms-auto flex shrink-0 items-center gap-2 text-muted-foreground">
                  <Users className="size-4" aria-hidden />
                  {g.capacity === null ? (
                    t('groups.students', { count: g.studentCount })
                  ) : (
                    <bdi>{t('groups.seats', { count: g.studentCount, capacity: g.capacity })}</bdi>
                  )}
                </span>
              </div>
              {g.monthlyFeePiastres !== null && (
                <p className="-mt-2 text-sm text-muted-foreground">
                  {t('groups.perMonth', { fee: formatEgp(g.monthlyFeePiastres, lang) })}
                </p>
              )}
            </Panel>
          );
          return (
            <li
              key={g.id}
              className="grid animate-rise gap-2"
              style={{ animationDelay: `${i * 50}ms` }}
            >
              {canWrite ? (
                <Link
                  to={`/groups/${g.id}`}
                  className="block h-full rounded-2xl focus-visible:ring-2"
                >
                  {card}
                </Link>
              ) : (
                card
              )}
              {/* Every role that sees the group grades its exams, assistants too. */}
              <Link
                to={`/groups/${g.id}/exams`}
                className="flex min-h-10 items-center justify-center gap-2 rounded-xl border bg-card text-sm font-medium hover:border-ink/40 focus-visible:ring-2"
              >
                <ClipboardList className="size-4 text-ink" aria-hidden />
                {t('exams.title')}
              </Link>
            </li>
          );
        })}
      </ul>
    </div>
  );
}

const TONES = [
  'bg-ink-soft text-ink',
  'bg-violet-soft text-violet',
  'bg-teal-soft text-teal',
  'bg-amber-soft text-amber',
];
