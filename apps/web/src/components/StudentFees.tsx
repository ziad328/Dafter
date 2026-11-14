import type { LedgerEntry } from '@dafter/contracts';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Link } from 'react-router';
import {
  useCreatePaymentMutation,
  useGetStudentLedgerQuery,
  useListEnrollmentsQuery,
  useReverseEntryMutation,
} from '@/api/generated';
import { Field, FormError, SelectField, Skeleton } from '@/components/Field';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { itemName } from '@/lib/groups';
import { egpText, formatEgp, toPiastres } from '@/lib/money';
import { errorKey } from '@/lib/session';

const METHODS = ['cash', 'vodafone_cash', 'instapay'] as const;

/** Balance, entries, record a payment, reverse. Money waits for the server (no optimistic UI). */
export function StudentFees({ studentId }: { studentId: string }) {
  const { t, i18n } = useTranslation();
  const lang = i18n.language;
  const ledger = useGetStudentLedgerQuery({ id: studentId });
  const enrollments = useListEnrollmentsQuery({ id: studentId });
  const [pay, paying] = useCreatePaymentMutation();
  const [groupId, setGroupId] = useState('');
  // undefined until the user types: then the field shows what the student owes (one group only).
  const [amount, setAmount] = useState<string>();
  const [method, setMethod] = useState<(typeof METHODS)[number]>('cash');
  // One key per intended payment: a retry of the same tap reuses it, a new payment gets a new one.
  const [idem, setIdem] = useState(() => crypto.randomUUID());
  // A changed request is a new payment: a new key, or the server answers IDEMPOTENCY_KEY_REUSED.
  const edit =
    <T,>(set: (v: T) => void) =>
    (v: T) => {
      set(v);
      setIdem(crypto.randomUUID());
    };
  const groups = enrollments.data?.filter((e) => e.status === 'active') ?? [];
  const due = ledger.data?.balancePiastres ?? 0;
  const shown = amount ?? (due > 0 && groups.length === 1 ? egpText(due) : '');
  const piastres = toPiastres(shown);
  const group = groupId || groups[0]?.groupId || '';

  if (ledger.isLoading) return <Skeleton />;
  const balance = ledger.data?.balancePiastres ?? 0;

  const onPay = async () => {
    if (!piastres || !group) return;
    const res = await pay({
      'idempotency-key': idem,
      createPaymentRequest: { studentId, groupId: group, amountPiastres: piastres, method },
    });
    if (res.data) {
      setAmount(undefined);
      setIdem(crypto.randomUUID());
    }
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle>
          <h2>{t('fees.title')}</h2>
        </CardTitle>
      </CardHeader>
      <CardContent className="grid gap-3">
        <p role="status" className="text-lg font-semibold" data-testid="balance">
          {balance === 0 ? t('fees.settled') : t(balance > 0 ? 'fees.owes' : 'fees.credit')}
          {balance !== 0 && <bdi className="ms-1">{formatEgp(Math.abs(balance), lang)}</bdi>}
        </p>
        <ul className="grid gap-2" data-testid="ledger">
          {ledger.data?.entries.map((e) => (
            <Entry key={e.id} entry={e} />
          ))}
        </ul>
        {groups.length > 0 && (
          <fieldset className="grid gap-3 rounded-md border p-3">
            <legend className="px-1 text-sm font-medium">{t('fees.record')}</legend>
            {groups.length > 1 && (
              <SelectField
                label={t('enrollments.group')}
                value={group}
                onChange={(ev) => edit(setGroupId)(ev.target.value)}
              >
                {groups.map((g) => (
                  <option key={g.groupId} value={g.groupId}>
                    {`${itemName(g.subject, lang)} · ${g.teacherName}`}
                  </option>
                ))}
              </SelectField>
            )}
            <Field
              label={t('fees.amount')}
              inputMode="decimal"
              dir="ltr"
              value={shown}
              onChange={(ev) => edit(setAmount)(ev.target.value)}
              error={shown && !piastres ? t('form.invalid.amount') : undefined}
            />
            <SelectField
              label={t('fees.method')}
              value={method}
              onChange={(ev) => edit(setMethod)(ev.target.value as typeof method)}
            >
              {METHODS.map((m) => (
                <option key={m} value={m}>
                  {t(`fees.methods.${m}`)}
                </option>
              ))}
            </SelectField>
            <FormError message={paying.error && t(errorKey(paying.error))} />
            <Button
              type="button"
              disabled={!piastres || paying.isLoading}
              onClick={() => void onPay()}
            >
              {paying.isLoading ? t('fees.saving') : t('fees.save')}
            </Button>
          </fieldset>
        )}
      </CardContent>
    </Card>
  );
}

function Entry({ entry: e }: { entry: LedgerEntry }) {
  const { t, i18n } = useTranslation();
  const [reverse, reversing] = useReverseEntryMutation();
  const [confirming, setConfirming] = useState(false);
  const [idem] = useState(() => crypto.randomUUID());
  const reversible = e.type !== 'reversal' && !e.reversedById;
  const what =
    e.type === 'charge'
      ? t('fees.charge', { period: e.period ?? '' })
      : e.type === 'payment'
        ? t('fees.payment', { method: t(`fees.methods.${e.method ?? 'cash'}`) })
        : t('fees.reversal');

  return (
    <li className="grid gap-1 text-sm">
      <div className="flex justify-between gap-2">
        <span className={e.reversedById ? 'line-through' : undefined}>
          {`${what} · ${itemName(e.subject, i18n.language)}`}
        </span>
        <bdi dir="ltr">{formatEgp(Math.abs(e.amountPiastres), i18n.language)}</bdi>
      </div>
      <div className="flex flex-wrap items-center gap-2">
        {e.receiptNo && (
          <Link className="underline" to={`/receipts/${e.id}`}>
            {t('fees.receipt')}
            <bdi className="ms-1">{e.receiptNo}</bdi>
          </Link>
        )}
        {e.reversedById && <span className="text-muted-foreground">{t('fees.reversed')}</span>}
        {reversible && (
          <Button
            size="sm"
            variant={confirming ? 'destructive' : 'ghost'}
            disabled={reversing.isLoading}
            onClick={() => {
              if (!confirming) return setConfirming(true);
              void reverse({ id: e.id, 'idempotency-key': idem });
            }}
          >
            {t(confirming ? 'fees.confirmReverse' : 'fees.reverse')}
          </Button>
        )}
      </div>
      <FormError message={reversing.error && t(errorKey(reversing.error))} />
    </li>
  );
}
