import type { ReactNode } from 'react';
import { useTranslation } from 'react-i18next';
import { useParams } from 'react-router';
import { useGetReceiptQuery } from '@/api/generated';
import { FormError, Skeleton } from '@/components/Field';
import { Button } from '@/components/ui/button';
import { formatEgp } from '@/lib/money';
import { errorKey } from '@/lib/session';
import { dayLabel, localDate, localTime } from '@/lib/time';

/** Print-ready receipt (rule 12): the browser prints or saves it as PDF; the server makes no PDF. */
export default function Receipt() {
  const { t, i18n } = useTranslation();
  const lang = i18n.language;
  const { id } = useParams();
  const { data, error, isLoading } = useGetReceiptQuery({ id: id! });
  if (isLoading) return <Skeleton />;
  if (error || !data) return <FormError message={t(errorKey(error))} />;
  const { entry, center, timezone } = data;
  const row = (label: string, value: ReactNode) => (
    <div className="flex justify-between gap-4 border-b py-2">
      <dt className="text-muted-foreground">{label}</dt>
      <dd className="font-medium">{value}</dd>
    </div>
  );

  return (
    <article className="grid gap-4 rounded-md bg-white p-6 text-black print:p-0">
      <header className="text-center">
        <h1 className="text-xl font-bold">
          {lang === 'en' && center.nameEn ? center.nameEn : center.nameAr}
        </h1>
        <p>{t('receipt.title', { no: entry.receiptNo ?? '' })}</p>
      </header>
      <dl>
        {row(t('receipt.student'), data.studentName)}
        {row(
          t('receipt.date'),
          `${dayLabel(localDate(entry.createdAt, timezone), lang)} ${localTime(entry.createdAt, timezone)}`,
        )}
        {row(t('receipt.amount'), <bdi>{formatEgp(-entry.amountPiastres, lang)}</bdi>)}
        {row(t('fees.method'), t(`fees.methods.${entry.method ?? 'cash'}`))}
        {row(t('receipt.receivedBy'), entry.createdByName ?? '')}
      </dl>
      {entry.reversedById && <p className="text-center font-bold">{t('fees.reversed')}</p>}
      <Button className="print:hidden" onClick={() => window.print()}>
        {t('receipt.print')}
      </Button>
    </article>
  );
}
