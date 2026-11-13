import { useTranslation } from 'react-i18next';
import { Link } from 'react-router';
import { useGetCurrentWorkspaceQuery, useListGroupsQuery } from '@/api/generated';
import { FormError, Skeleton } from '@/components/Field';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { itemName, sortedSlots, weekdayName } from '@/lib/groups';
import { errorKey } from '@/lib/session';

export default function Groups() {
  const { t, i18n } = useTranslation();
  const lang = i18n.language;
  const list = useListGroupsQuery();
  const role = useGetCurrentWorkspaceQuery().data?.role;
  // Assistants read their teachers' groups but never edit them.
  const canWrite = role === 'owner' || role === 'teacher';

  if (list.isLoading) return <Skeleton />;

  return (
    <div className="grid gap-4">
      <div className="flex items-center justify-between gap-2">
        <h1 className="text-xl font-bold">{t('groups.title')}</h1>
        {canWrite && (
          <Button asChild size="sm">
            <Link to="/groups/new">{t('groups.new')}</Link>
          </Button>
        )}
      </div>
      <FormError message={list.error && t(errorKey(list.error))} />
      {list.data?.length === 0 && (
        <p className="text-sm text-muted-foreground">{t('groups.empty')}</p>
      )}
      {list.data?.map((g) => {
        const card = (
          <Card className="gap-3 py-4">
            <CardHeader className="px-4">
              <CardTitle>
                <h2>{`${itemName(g.subject, lang)} · ${itemName(g.gradeLevel, lang)}`}</h2>
              </CardTitle>
              <CardDescription>
                {g.teacherName}
                {g.status === 'archived' && ` · ${t('groups.archived')}`}
              </CardDescription>
            </CardHeader>
            <CardContent className="grid gap-1 px-4 text-sm">
              {sortedSlots(g).map((s) => (
                <p key={`${s.weekday}-${s.startTime}`}>
                  {weekdayName(lang, s.weekday)}{' '}
                  <bdi dir="ltr">{`${s.startTime}–${s.endTime}`}</bdi>
                </p>
              ))}
              {g.capacity !== null && (
                <p className="text-muted-foreground">
                  {t('groups.capacity')} <bdi>{g.capacity}</bdi>
                </p>
              )}
            </CardContent>
          </Card>
        );
        return canWrite ? (
          <Link key={g.id} to={`/groups/${g.id}`} className="rounded-xl focus-visible:ring-2">
            {card}
          </Link>
        ) : (
          <div key={g.id}>{card}</div>
        );
      })}
    </div>
  );
}
