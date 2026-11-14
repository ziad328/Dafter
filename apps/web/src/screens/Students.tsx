import { ChevronLeft, Search, UserPlus, Wallet } from 'lucide-react';
import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Link, useSearchParams } from 'react-router';
import { useListGroupsQuery, useListStudentsQuery } from '@/api/generated';
import { FormError, Skeleton } from '@/components/Field';
import { FilterChips, uniqueOptions } from '@/components/FilterChips';
import { Avatar, PageHeader, Panel } from '@/components/Page';
import { PaymentSheet } from '@/components/PaymentSheet';
import { Button } from '@/components/ui/button';
import { itemName } from '@/lib/groups';
import { formatEgp } from '@/lib/money';
import { errorKey } from '@/lib/session';
import { cn } from '@/lib/utils';

export default function Students() {
  const { t, i18n } = useTranslation();
  // The laptop top bar's search lands here as ?q=.
  const [params] = useSearchParams();
  const [text, setText] = useState(() => params.get('q') ?? '');
  const [q, setQ] = useState(text.trim());
  // Debounced: one request after typing pauses, not one per key.
  useEffect(() => {
    const timer = setTimeout(() => setQ(text.trim()), 300);
    return () => clearTimeout(timer);
  }, [text]);
  // Narrow by group, grade, or who owes (audit ST4); groups name the choices.
  const [groupId, setGroupId] = useState('');
  const [gradeLevelId, setGradeLevelId] = useState('');
  const [owes, setOwes] = useState(false);
  const groups = useListGroupsQuery().data ?? [];
  const list = useListStudentsQuery({
    q: q || undefined,
    groupId: groupId || undefined,
    gradeLevelId: gradeLevelId || undefined,
    owes: owes ? 'true' : undefined,
  });
  const filtered = !!(q || groupId || gradeLevelId || owes);
  const [paying, setPaying] = useState(false);

  return (
    <div className="grid gap-5">
      <PageHeader
        title={t('students.title')}
        action={
          <div className="flex gap-2">
            <Button variant="outline" onClick={() => setPaying(true)}>
              <Wallet aria-hidden />
              {t('fees.record')}
            </Button>
            <Button asChild>
              <Link to="/students/new">
                <UserPlus aria-hidden />
                {t('students.new')}
              </Link>
            </Button>
          </div>
        }
      />
      <PaymentSheet open={paying} onClose={() => setPaying(false)} />
      <div className="relative">
        <Search
          className="pointer-events-none absolute start-3 top-1/2 size-5 -translate-y-1/2 text-muted-foreground"
          aria-hidden
        />
        <input
          type="search"
          aria-label={t('students.search')}
          placeholder={t('students.search')}
          value={text}
          onChange={(e) => setText(e.target.value)}
          className="h-12 w-full rounded-2xl border bg-card ps-10 pe-4 text-base shadow-card outline-none focus-visible:ring-2 focus-visible:ring-ring"
        />
      </div>
      <div className="grid gap-2">
        <button
          type="button"
          aria-pressed={owes}
          onClick={() => setOwes(!owes)}
          className={cn(
            'h-9 justify-self-start rounded-full border px-4 text-sm font-medium transition-colors',
            owes ? 'border-rose bg-rose text-white' : 'bg-card hover:bg-rose-soft',
          )}
        >
          {t('students.owes')}
        </button>
        <FilterChips
          label={t('enrollments.group')}
          value={groupId}
          onChange={setGroupId}
          options={groups.map((g) => ({
            value: g.id,
            label: `${itemName(g.subject, i18n.language)} · ${g.teacherName}`,
          }))}
        />
        <FilterChips
          label={t('students.gradeLevel')}
          value={gradeLevelId}
          onChange={setGradeLevelId}
          options={uniqueOptions(
            groups.map((g) => ({
              value: g.gradeLevel.id,
              label: itemName(g.gradeLevel, i18n.language),
            })),
          )}
        />
      </div>
      <FormError message={list.error && t(errorKey(list.error))} />
      {list.isLoading && <Skeleton />}
      {list.data?.length === 0 && (
        <Panel className="p-8 text-center text-muted-foreground">
          {t(filtered ? 'students.noResults' : 'students.empty')}
        </Panel>
      )}
      {!!list.data?.length && (
        <Panel className="overflow-hidden">
          <ul className="divide-y">
            {list.data.map((s, i) => {
              const name = i18n.language === 'en' && s.nameEn ? s.nameEn : s.nameAr;
              return (
                <li
                  key={s.id}
                  className="animate-rise"
                  style={{ animationDelay: `${Math.min(i, 12) * 30}ms` }}
                >
                  <Link
                    to={`/students/${s.id}`}
                    className="flex items-center gap-3 px-4 py-3 transition-colors hover:bg-ink-soft/50 focus-visible:bg-ink-soft"
                  >
                    <Avatar name={name} />
                    <span className="grid min-w-0 flex-1">
                      <h2 className="truncate font-semibold">{name}</h2>
                      <span className="truncate text-sm text-muted-foreground">
                        {itemName(s.gradeLevel, i18n.language)}
                        {s.phone && (
                          <>
                            {' · '}
                            <bdi>{s.phone}</bdi>
                          </>
                        )}
                      </span>
                    </span>
                    {s.balancePiastres > 0 && (
                      <bdi className="shrink-0 rounded-full bg-rose-soft px-2 py-0.5 text-xs font-medium text-rose">
                        {formatEgp(s.balancePiastres, i18n.language)}
                      </bdi>
                    )}
                    {s.status === 'archived' && (
                      <span className="rounded-full bg-muted px-2 py-0.5 text-xs text-muted-foreground">
                        {t('students.statuses.archived')}
                      </span>
                    )}
                    <ChevronLeft
                      className="size-5 text-muted-foreground ltr:-scale-x-100"
                      aria-hidden
                    />
                  </Link>
                </li>
              );
            })}
          </ul>
        </Panel>
      )}
    </div>
  );
}
