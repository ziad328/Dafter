import { BookOpen, Plus } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { Link } from 'react-router';
import { useGetCurrentWorkspaceQuery, useListGroupsQuery } from '@/api/generated';
import { FormError, Skeleton } from '@/components/Field';
import { Avatar, PageHeader, Panel } from '@/components/Page';
import { Button } from '@/components/ui/button';
import { itemName, sortedSlots, weekdayName } from '@/lib/groups';
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

  if (list.isLoading) return <Skeleton />;

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
      {list.data?.length === 0 && (
        <Panel className="p-8 text-center text-muted-foreground">{t('groups.empty')}</Panel>
      )}
      <ul className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
        {list.data?.map((g, i) => {
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
              </ul>
              <div className="flex items-center gap-2 border-t pt-3 text-sm">
                <Avatar name={g.teacherName} className="size-8 text-xs" />
                <span className="truncate">{g.teacherName}</span>
                {g.capacity !== null && (
                  <span className="ms-auto text-muted-foreground">
                    {t('groups.capacity')} <bdi>{g.capacity}</bdi>
                  </span>
                )}
              </div>
            </Panel>
          );
          return (
            <li key={g.id} className="animate-rise" style={{ animationDelay: `${i * 50}ms` }}>
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
