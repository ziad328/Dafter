import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useGetCashSummaryQuery, type StaffCash } from '@/api/generated';
import { FormError, Skeleton } from '@/components/Field';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { formatEgp } from '@/lib/money';
import { errorKey } from '@/lib/session';
import { dayLabel, displayTime, localDate } from '@/lib/time';

const METHODS = ['cash', 'vodafone_cash', 'instapay'] as const;

/**
 * End-of-day cash summary to hand over (rule 12: print-ready, the browser saves it as PDF).
 * The API decides whose sections come back: the caller's own, or everyone's for the owner.
 */
export default function CashSummary() {
  const { t, i18n } = useTranslation();
  const lang = i18n.language;
  const [date, setDate] = useState<string>();
  const { data, error, isFetching } = useGetCashSummaryQuery({ date });
  if (!data && isFetching) return <Skeleton />;
  if (error || !data) return <FormError message={t(errorKey(error))} />;
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
        <p>{dayLabel(data.date, lang)}</p>
      </header>
      <label className="grid gap-1 text-sm print:hidden">
        {t('cashSummary.day')}
        <Input
          type="date"
          value={data.date}
          max={localDate(new Date(), data.timezone)}
          onChange={(e) => setDate(e.target.value || undefined)}
        />
      </label>
      {data.staff.map(section)}
      <Button className="print:hidden" onClick={() => window.print()}>
        {t('receipt.print')}
      </Button>
    </article>
  );
}
