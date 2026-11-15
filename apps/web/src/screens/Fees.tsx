import type { MethodTotals } from '@dafter/contracts';
import { useTranslation } from 'react-i18next';
import { Link } from 'react-router';
import { useGetCollectionStatsQuery, useGetOwingStudentsQuery } from '@/api/generated';
import { FormError, Skeleton } from '@/components/Field';
import { Avatar, PageHeader, Panel } from '@/components/Page';
import { itemName } from '@/lib/groups';
import { formatEgp } from '@/lib/money';
import { errorKey } from '@/lib/session';
import { cn } from '@/lib/utils';

const METHODS = ['cash', 'vodafone_cash', 'instapay'] as const;

/** One half of the totals card: the sum, then only the methods that took money (audit 3 F1). */
function Totals({
  title,
  totals,
  className,
}: {
  title: string;
  totals: MethodTotals;
  className?: string;
}) {
  const { t, i18n } = useTranslation();
  const used = METHODS.filter((m) => totals[m] > 0);
  return (
    <div className={cn('grid content-start gap-1 p-4', className)}>
      <h2 className="text-sm text-muted-foreground">{title}</h2>
      <bdi className="text-2xl font-bold">{formatEgp(totals.total, i18n.language)}</bdi>
      {used.length > 1 && (
        <dl className="grid gap-0.5 text-xs text-muted-foreground">
          {used.map((m) => (
            <div key={m} className="flex justify-between gap-3">
              <dt>{t(`fees.methods.${m}`)}</dt>
              <dd>
                <bdi>{formatEgp(totals[m], i18n.language)}</bdi>
              </dd>
            </div>
          ))}
        </dl>
      )}
      {used.length === 1 && (
        <p className="text-xs text-muted-foreground">{t(`fees.methods.${used[0]!}`)}</p>
      )}
    </div>
  );
}

/** Owner and assistant: money in today and this month, and who owes, biggest debt first. */
export default function Fees() {
  const { t, i18n } = useTranslation();
  const stats = useGetCollectionStatsQuery();
  const owing = useGetOwingStudentsQuery();
  const error = stats.error ?? owing.error;

  return (
    <div className="grid gap-6">
      <PageHeader title={t('feesView.title')} />
      <FormError message={error && t(errorKey(error))} />
      {stats.isLoading && <Skeleton />}
      {stats.data && (
        <Panel className="grid grid-cols-2">
          <Totals title={t('feesView.today')} totals={stats.data.today} />
          <Totals className="border-s" title={t('feesView.month')} totals={stats.data.month} />
        </Panel>
      )}
      <section className="grid gap-3">
        <h2 className="text-lg font-semibold">
          {t('feesView.owing', { count: owing.data?.length ?? 0 })}
        </h2>
        {owing.isLoading && <Skeleton />}
        {owing.data?.length === 0 && (
          <Panel className="p-8 text-center text-muted-foreground">{t('feesView.noneOwe')}</Panel>
        )}
        {!!owing.data?.length && (
          <Panel className="overflow-hidden">
            <ul className="divide-y">
              {owing.data.map((s) => {
                const name = i18n.language === 'en' && s.nameEn ? s.nameEn : s.nameAr;
                return (
                  <li key={s.id}>
                    <Link
                      to={`/students/${s.id}`}
                      className="flex items-center gap-3 px-4 py-3 transition-colors hover:bg-ink-soft/50 focus-visible:bg-ink-soft"
                    >
                      <Avatar name={name} />
                      <span className="grid min-w-0 flex-1">
                        <span className="truncate font-semibold">{name}</span>
                        <span className="truncate text-sm text-muted-foreground">
                          {itemName(s.gradeLevel, i18n.language)}
                        </span>
                      </span>
                      <bdi className="shrink-0 font-semibold text-rose">
                        {formatEgp(s.balancePiastres, i18n.language)}
                      </bdi>
                    </Link>
                  </li>
                );
              })}
            </ul>
          </Panel>
        )}
      </section>
    </div>
  );
}
