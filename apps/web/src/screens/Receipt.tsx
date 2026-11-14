import type { ReactNode } from 'react';
import { useTranslation } from 'react-i18next';
import { useParams } from 'react-router';
import { useGetReceiptQuery } from '@/api/generated';
import { FormError, Skeleton } from '@/components/Field';
import { ShareButton } from '@/components/ShareButton';
import { Button } from '@/components/ui/button';
import { formatEgp } from '@/lib/money';
import { errorKey } from '@/lib/session';
import { dayLabel, displayTime, localDate } from '@/lib/time';

/** Print-ready receipt (rule 12): the browser prints or saves it as PDF; the server makes no PDF. */
export default function Receipt() {
  const { t, i18n } = useTranslation();
  const lang = i18n.language;
  const { id } = useParams();
  const { data, error, isLoading } = useGetReceiptQuery({ id: id! });
  if (isLoading) return <Skeleton />;
  if (error || !data) return <FormError message={t(errorKey(error))} />;
  const { entry, center, timezone } = data;
  const centerName = lang === 'en' && center.nameEn ? center.nameEn : center.nameAr;
  const date = `${dayLabel(localDate(entry.createdAt, timezone), lang)} ${displayTime(entry.createdAt, timezone, lang)}`;
  const amount = formatEgp(-entry.amountPiastres, lang);
  const method = t(`fees.methods.${entry.method ?? 'cash'}`);
  // Sent as text: the parent has no account, so a link to this page would not open for them.
  const shareText = [
    centerName,
    t('receipt.title', { no: entry.receiptNo ?? '' }),
    `${t('receipt.student')}: ${data.studentName}`,
    `${t('receipt.amount')}: ${amount}`,
    `${t('fees.method')}: ${method}`,
    `${t('receipt.date')}: ${date}`,
  ].join('\n');
  const row = (label: string, value: ReactNode) => (
    <div className="flex justify-between gap-4 border-b py-2">
      <dt className="text-muted-foreground">{label}</dt>
      <dd className="font-medium">{value}</dd>
    </div>
  );

  return (
    <article className="grid gap-4 rounded-md bg-white p-6 text-black print:p-0">
      <header className="text-center">
        <h1 className="text-xl font-bold">{centerName}</h1>
        <p>{t('receipt.title', { no: entry.receiptNo ?? '' })}</p>
        {entry.reversedById && (
          <p
            role="status"
            className="mx-auto mt-3 w-fit -rotate-6 rounded-md border-2 border-rose px-4 py-1 text-2xl font-bold text-rose"
          >
            {t('receipt.voided')}
          </p>
        )}
      </header>
      <dl>
        {row(t('receipt.student'), data.studentName)}
        {row(t('receipt.date'), date)}
        {row(
          t('receipt.amount'),
          <bdi className={entry.reversedById ? 'line-through' : undefined}>{amount}</bdi>,
        )}
        {row(t('fees.method'), method)}
        {row(t('receipt.receivedBy'), entry.createdByName ?? '')}
      </dl>
      <div className="grid gap-2 print:hidden">
        <Button onClick={() => window.print()}>{t('receipt.print')}</Button>
        {!entry.reversedById && <ShareButton text={shareText} />}
      </div>
    </article>
  );
}
