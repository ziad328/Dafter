import type { MethodTotals } from '@dafter/contracts';
import { useTranslation } from 'react-i18next';
import { Link } from 'react-router';
import { useGetCollectionStatsQuery, useListStudentsQuery } from '@/api/generated';
import { FormError, Skeleton } from '@/components/Field';
import { Avatar, PageHeader, Panel } from '@/components/Page';
import { itemName } from '@/lib/groups';
import { formatEgp } from '@/lib/money';
import { errorKey } from '@/lib/session';

const METHODS = ['cash', 'vodafone_cash', 'instapay'] as const;

function Totals({ title, totals }: { title: string; totals: MethodTotals }) {
  const { t, i18n } = useTranslation();
  return (
    <Panel className="grid gap-3 p-5">
      <h2 className="text-sm text-muted-foreground">{title}</h2>
      <bdi className="text-2xl font-bold">{formatEgp(totals.total, i18n.language)}</bdi>
      <dl className="grid gap-1 text-sm">
        {METHODS.map((m) => (
          <div key={m} className="flex justify-between gap-3">
            <dt className="text-muted-foreground">{t(`fees.methods.${m}`)}</dt>
            <dd>
              <bdi>{formatEgp(totals[m], i18n.language)}</bdi>
            </dd>
          </div>
        ))}
      </dl>
    </Panel>
  );
}

/** Owner and assistant: money in today and this month, and who owes, biggest debt first. */
export default function Fees() {
  const { t, i18n } = useTranslation();
  const stats = useGetCollectionStatsQuery();
  const owing = useListStudentsQuery({ owes: 'true' });
  const error = stats.error ?? owing.error;

  return (
    <div className="grid gap-6">
      <PageHeader title={t('feesView.title')} />
      <FormError message={error && t(errorKey(error))} />
      {stats.isLoading && <Skeleton />}
      {stats.data && (
        <div className="grid gap-4 sm:grid-cols-2">
          <Totals title={t('feesView.today')} totals={stats.data.today} />
          <Totals title={t('feesView.month')} totals={stats.data.month} />
        </div>
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
