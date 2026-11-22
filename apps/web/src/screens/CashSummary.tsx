import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import {
  type StaffCash,
  useGetCashSummaryQuery,
  useGetCurrentWorkspaceQuery,
  useListMembersQuery,
} from '@/api/generated';
import { FormError, Skeleton } from '@/components/Field';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { formatEgp } from '@/lib/money';
import { errorKey } from '@/lib/session';
import { addDays, dayLabel, displayTime, localDate, rangeLabel } from '@/lib/time';

const METHODS = ['cash', 'vodafone_cash', 'instapay'] as const;
// The API's limit: a range of at most 31 days.
const MAX_DAYS = 31;

/**
 * End-of-day cash summary to hand over (rule 12: print-ready, the browser saves it as PDF).
 * The API decides whose sections come back: the caller's own, or everyone's for the owner, who
 * can also pick one person. One day, or a range of up to 31 days.
 */
export default function CashSummary() {
  const { t, i18n } = useTranslation();
  const lang = i18n.language;
  const isOwner = useGetCurrentWorkspaceQuery().data?.role === 'owner';
  const members = useListMembersQuery(undefined, { skip: !isOwner }).data ?? [];
  const [date, setDate] = useState<string>();
  const [to, setTo] = useState<string>();
  const [userId, setUserId] = useState<string>();
  // A last day only counts with a first day, on or after it and within the limit.
  const badRange = !!to && (!date || to < date || to > addDays(date, MAX_DAYS - 1));
  const { data, error, isFetching } = useGetCashSummaryQuery({
    date,
    to: badRange ? undefined : to,
    userId,
  });
  if (!data && isFetching) return <Skeleton />;
  if (error || !data) return <FormError message={t(errorKey(error))} />;
  const oneDay = data.date === data.to;
  const centerName = lang === 'en' && data.center.nameEn ? data.center.nameEn : data.center.nameAr;
  const money = (p: number) => <bdi>{formatEgp(p, lang)}</bdi>;

  const section = (s: StaffCash) => (
    <section
      key={s.userId}
      aria-label={s.name}
      className="grid gap-3 break-inside-avoid border-t pt-4"
    >
      <h2 className="text-lg font-bold">{s.name}</h2>
      <dl className="grid gap-1">
        {METHODS.map((m) => (
          <div key={m} className="flex justify-between gap-4">
            <dt className="text-muted-foreground">{t(`fees.methods.${m}`)}</dt>
            <dd>{money(s.totals[m])}</dd>
          </div>
        ))}
        <div className="flex justify-between gap-4 border-t pt-1 font-bold">
          <dt>{t('cashSummary.total')}</dt>
          <dd data-testid="staff-total">{money(s.totals.total)}</dd>
        </div>
      </dl>
      {s.entries.length === 0 ? (
        <p className="text-muted-foreground">{t('cashSummary.empty')}</p>
      ) : (
        <table className="w-full text-sm">
          <thead className="text-muted-foreground">
            <tr>
              <th className="py-1 pe-3 text-start font-normal">{t('cashSummary.time')}</th>
              <th className="py-1 pe-3 text-start font-normal">{t('cashSummary.receiptNo')}</th>
              <th className="py-1 pe-3 text-start font-normal">{t('receipt.student')}</th>
              <th className="py-1 text-end font-normal">{t('receipt.amount')}</th>
            </tr>
          </thead>
          <tbody>
            {s.entries.map((e) => (
              <tr key={e.id} className={e.kind === 'reversal' ? 'text-rose' : undefined}>
                {/* Spacing, and the time never wraps, so it doesn't run into the receipt number on a
                  phone (audit 3 F4). */}
                <td className="py-1 pe-3 whitespace-nowrap">
                  {!oneDay && (
                    <span className="block text-xs text-muted-foreground">
                      {rangeLabel(
                        localDate(e.createdAt, data.timezone),
                        localDate(e.createdAt, data.timezone),
                        lang,
                      )}
                    </span>
                  )}
                  <bdi>{displayTime(e.createdAt, data.timezone, lang)}</bdi>
                </td>
                <td className="py-1 pe-3">
                  <bdi>{e.receiptNo}</bdi>
                  {e.kind === 'reversal' && ` ${t('cashSummary.reversed')}`}
                </td>
                <td className="py-1 pe-3">{e.studentName}</td>
                <td className="py-1 text-end">
                  {money(e.amountPiastres)}
                  <span className="block text-xs text-muted-foreground">
                    {t(`fees.methods.${e.method}`)}
                  </span>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </section>
  );

  return (
    // The app's colours on screen; white paper only when printed (audit 3 F3).
    <article className="grid gap-4 rounded-2xl border bg-card p-6 text-card-foreground shadow-card print:border-0 print:bg-white print:p-0 print:text-black print:shadow-none">
      <header className="text-center">
        <p className="font-bold">{centerName}</p>
        <h1 className="text-xl font-bold">{t('cashSummary.title')}</h1>
        <p>{oneDay ? dayLabel(data.date, lang) : rangeLabel(data.date, data.to, lang)}</p>
        {userId && <p>{data.staff[0]?.name}</p>}
      </header>
      <div className="grid gap-3 sm:grid-cols-2 print:hidden">
        <label className="grid gap-1 text-sm">
          {t('cashSummary.day')}
          <Input
            type="date"
            value={data.date}
            max={localDate(new Date(), data.timezone)}
            onChange={(e) => setDate(e.target.value || undefined)}
          />
        </label>
        <label className="grid gap-1 text-sm">
          {t('cashSummary.to')}
          <Input
            type="date"
            value={to ?? ''}
            min={data.date}
            aria-invalid={badRange || undefined}
            onChange={(e) => setTo(e.target.value || undefined)}
          />
        </label>
        {isOwner && (
          <label className="grid gap-1 text-sm sm:col-span-2">
            {t('cashSummary.person')}
            <select
              className="h-10 rounded-md border border-input bg-background px-2"
              value={userId ?? ''}
              onChange={(e) => setUserId(e.target.value || undefined)}
            >
              <option value="">{t('cashSummary.everyone')}</option>
              {members.map((m) => (
                <option key={m.userId} value={m.userId}>
                  {m.name}
                </option>
              ))}
            </select>
          </label>
        )}
      </div>
      {badRange && <FormError message={t('cashSummary.badRange')} />}
      {data.staff.map(section)}
      <Button className="print:hidden" onClick={() => window.print()}>
        {t('receipt.print')}
      </Button>
    </article>
  );
}
