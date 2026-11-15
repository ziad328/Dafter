import type { LedgerEntry } from '@dafter/contracts';
import { MoreHorizontal } from 'lucide-react';
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
import { monthLabel } from '@/lib/time';

const METHODS = ['cash', 'vodafone_cash', 'instapay'] as const;

/** Balance, entries, record a payment, reverse. Money waits for the server (no optimistic UI). */
/** Balance, entries, record a payment, reverse. Money waits for the server (no optimistic UI). */
export function StudentFees({ studentId }: { studentId: string }) {
  const { t, i18n } = useTranslation();
  const ledger = useGetStudentLedgerQuery({ id: studentId });
  if (ledger.isLoading) return <Skeleton />;
  const balance = ledger.data?.balancePiastres ?? 0;

  return (
    <Card>
      <CardHeader>
        <CardTitle>
          <h2>{t('fees.title')}</h2>
        </CardTitle>
      </CardHeader>
      <CardContent className="grid gap-3">
        <Balance piastres={balance} lang={i18n.language} />
        <ul className="grid gap-2" data-testid="ledger">
          {ledger.data?.entries.map((e) => (
            <Entry key={e.id} entry={e} />
          ))}
        </ul>
        <PaymentForm studentId={studentId} due={balance} />
      </CardContent>
    </Card>
  );
}

export function Balance({ piastres, lang }: { piastres: number; lang: string }) {
  const { t } = useTranslation();
  return (
    <p role="status" className="text-lg font-semibold" data-testid="balance">
      {piastres === 0 ? t('fees.settled') : t(piastres > 0 ? 'fees.owes' : 'fees.credit')}
      {piastres !== 0 && <bdi className="ms-1">{formatEgp(Math.abs(piastres), lang)}</bdi>}
    </p>
  );
}

/** Group, amount (pre-filled with what is owed when there is one group), method, save. */
export function PaymentForm({
  studentId,
  due,
  onPaid,
}: {
  studentId: string;
  due: number;
  onPaid?: (entry: LedgerEntry) => void;
}) {
  const { t, i18n } = useTranslation();
  const lang = i18n.language;
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
  const shown = amount ?? (due > 0 && groups.length === 1 ? egpText(due) : '');
  const piastres = toPiastres(shown);
  const group = groupId || groups[0]?.groupId || '';

  const onPay = async () => {
    if (!piastres || !group) return;
    const res = await pay({
      'idempotency-key': idem,
      createPaymentRequest: { studentId, groupId: group, amountPiastres: piastres, method },
    });
    if (res.data) {
      setAmount(undefined);
      setIdem(crypto.randomUUID());
      onPaid?.(res.data);
    }
  };

  if (enrollments.isLoading) return <Skeleton />;
  if (groups.length === 0) return null;
  return (
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
      <Button type="button" disabled={!piastres || paying.isLoading} onClick={() => void onPay()}>
        {paying.isLoading ? t('fees.saving') : t('fees.save')}
      </Button>
    </fieldset>
  );
}

function Entry({ entry: e }: { entry: LedgerEntry }) {
  const { t, i18n } = useTranslation();
  const [reverse, reversing] = useReverseEntryMutation();
  const [menu, setMenu] = useState(false);
  const [confirming, setConfirming] = useState(false);
  const [idem] = useState(() => crypto.randomUUID());
  const reversible = e.type !== 'reversal' && !e.reversedById;
  const what =
    e.type === 'charge'
      ? t('fees.charge', { period: e.period ? monthLabel(e.period, i18n.language) : '' })
      : e.type === 'payment'
        ? t('fees.payment', { method: t(`fees.methods.${e.method ?? 'cash'}`) })
        : t('fees.reversal');

  return (
    <li className="grid gap-1 text-sm">
      <div className="flex justify-between gap-2">
        <span className={e.reversedById ? 'line-through' : undefined}>
          {`${what} · ${itemName(e.subject, i18n.language)}`}
        </span>
        <span className="flex items-center gap-1">
          <bdi dir="ltr">{formatEgp(Math.abs(e.amountPiastres), i18n.language)}</bdi>
          {/* Reversing waits behind a menu, like the timetable, so it is never a stray tap. */}
          {reversible && (
            <Button
              size="icon-sm"
              variant="ghost"
              aria-label={t('fees.actions')}
              aria-expanded={menu}
              onClick={() => {
                setMenu(!menu);
                setConfirming(false);
              }}
            >
              <MoreHorizontal aria-hidden />
            </Button>
          )}
        </span>
      </div>
      <div className="flex flex-wrap items-center gap-2">
        {e.receiptNo && (
          <Link className="underline" to={`/receipts/${e.id}`}>
            {t('fees.receipt')} <bdi>{e.receiptNo}</bdi>
          </Link>
        )}
        {e.reversedById && <span className="text-muted-foreground">{t('fees.reversed')}</span>}
        {reversible && menu && (
          <Button
            size="sm"
            variant={confirming ? 'destructive' : 'ghost'}
            disabled={reversing.isLoading}
            onClick={() => {
              if (!confirming) return setConfirming(true);
              void reverse({ id: e.id, 'idempotency-key': idem });
            }}
          >
            {e.type === 'charge'
              ? t(confirming ? 'fees.confirmReverseCharge' : 'fees.reverseCharge')
              : t(confirming ? 'fees.confirmReverse' : 'fees.reverse')}
          </Button>
        )}
      </div>
      <FormError message={reversing.error && t(errorKey(reversing.error))} />
    </li>
  );
}
