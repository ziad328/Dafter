import type { LedgerEntry, Student } from '@dafter/contracts';
import { Search, X } from 'lucide-react';
import { useEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Link } from 'react-router';
import {
  useGetStudentLedgerQuery,
  useListEnrollmentsQuery,
  useListStudentsQuery,
} from '@/api/generated';
import { FormError, Skeleton } from '@/components/Field';
import { Avatar } from '@/components/Page';
import { Balance, PaymentForm } from '@/components/StudentFees';
import { Button } from '@/components/ui/button';
import { itemName } from '@/lib/groups';
import { errorKey } from '@/lib/session';

const studentName = (s: Student, lang: string) => (lang === 'en' && s.nameEn ? s.nameEn : s.nameAr);

/** Record a payment from anywhere: find the student, see what they owe, pay, open the receipt. */
export function PaymentSheet({ open, onClose }: { open: boolean; onClose: () => void }) {
  const { t } = useTranslation();
  const ref = useRef<HTMLDialogElement>(null);
  useEffect(() => {
    if (open) ref.current?.showModal();
    else ref.current?.close();
  }, [open]);

  return (
    <dialog
      ref={ref}
      onClose={onClose}
      aria-label={t('fees.record')}
      className="mx-auto mb-0 mt-auto max-h-[92dvh] w-full max-w-md overflow-y-auto rounded-t-3xl bg-card p-5 text-foreground shadow-card backdrop:bg-black/40 sm:mb-auto sm:rounded-3xl"
    >
      <div className="mb-4 flex items-center justify-between gap-2">
        <h2 className="text-lg font-semibold">{t('fees.record')}</h2>
        <Button size="icon" variant="ghost" aria-label={t('payments.close')} onClick={onClose}>
          <X aria-hidden />
        </Button>
      </div>
      {/* Mounted only while open, so each opening starts from an empty search. */}
      {open && <SheetBody />}
    </dialog>
  );
}

function SheetBody() {
  const { t, i18n } = useTranslation();
  const [student, setStudent] = useState<Student>();
  const [paid, setPaid] = useState<LedgerEntry>();

  if (paid && student)
    return (
      <div className="grid gap-3 text-center" role="status">
        <p className="font-semibold">
          {t('payments.done', { name: studentName(student, i18n.language) })}
        </p>
        <Button asChild>
          <Link to={`/receipts/${paid.id}`}>
            {t('fees.receipt')}
            <bdi className="ms-1">{paid.receiptNo}</bdi>
          </Link>
        </Button>
        <Button
          variant="outline"
          onClick={() => {
            setPaid(undefined);
            setStudent(undefined);
          }}
        >
          {t('payments.another')}
        </Button>
      </div>
    );
  if (student)
    return <StudentDue student={student} onBack={() => setStudent(undefined)} onPaid={setPaid} />;
  return <StudentSearch onPick={setStudent} />;
}

function StudentSearch({ onPick }: { onPick: (s: Student) => void }) {
  const { t, i18n } = useTranslation();
  const [text, setText] = useState('');
  const [q, setQ] = useState('');
  useEffect(() => {
    const timer = setTimeout(() => setQ(text.trim()), 300);
    return () => clearTimeout(timer);
  }, [text]);
  const list = useListStudentsQuery({ q }, { skip: !q });

  return (
    <div className="grid gap-3">
      <div className="relative">
        <Search
          className="pointer-events-none absolute start-3 top-1/2 size-5 -translate-y-1/2 text-muted-foreground"
          aria-hidden
        />
        <input
          type="search"
          autoFocus
          aria-label={t('students.search')}
          placeholder={t('students.search')}
          value={text}
          onChange={(e) => setText(e.target.value)}
          className="h-12 w-full rounded-2xl border bg-card ps-10 pe-4 text-base outline-none focus-visible:ring-2 focus-visible:ring-ring"
        />
      </div>
      <FormError message={list.error && t(errorKey(list.error))} />
      {list.isFetching && <Skeleton />}
      {q && list.data?.length === 0 && (
        <p className="text-center text-muted-foreground">{t('students.noResults')}</p>
      )}
      <ul className="grid divide-y">
        {list.data?.map((s) => {
          const name = studentName(s, i18n.language);
          return (
            <li key={s.id}>
              <button
                type="button"
                onClick={() => onPick(s)}
                className="flex w-full items-center gap-3 py-2 text-start hover:bg-ink-soft/50 focus-visible:bg-ink-soft"
              >
                <Avatar name={name} />
                <span className="grid min-w-0">
                  <span className="truncate font-semibold">{name}</span>
                  <span className="truncate text-sm text-muted-foreground">
                    {itemName(s.gradeLevel, i18n.language)}
                  </span>
                </span>
              </button>
            </li>
          );
        })}
      </ul>
    </div>
  );
}

function StudentDue({
  student,
  onBack,
  onPaid,
}: {
  student: Student;
  onBack: () => void;
  onPaid: (e: LedgerEntry) => void;
}) {
  const { t, i18n } = useTranslation();
  const lang = i18n.language;
  const ledger = useGetStudentLedgerQuery({ id: student.id });
  const enrollments = useListEnrollmentsQuery({ id: student.id });
  const groups = enrollments.data?.filter((e) => e.status === 'active') ?? [];
  const name = studentName(student, lang);

  return (
    <div className="grid gap-3">
      <div className="flex items-center gap-3">
        <Avatar name={name} />
        <span className="flex-1 truncate font-semibold">{name}</span>
        <Button size="sm" variant="ghost" onClick={onBack}>
          {t('payments.change')}
        </Button>
      </div>
      {ledger.isLoading || enrollments.isLoading ? (
        <Skeleton />
      ) : (
        <>
          <Balance piastres={ledger.data?.balancePiastres ?? 0} lang={lang} />
          <p className="text-sm text-muted-foreground">
            {groups.length === 0
              ? t('enrollments.empty')
              : new Intl.ListFormat(lang).format(
                  groups.map((g) => `${itemName(g.subject, lang)} · ${g.teacherName}`),
                )}
          </p>
          <PaymentForm
            studentId={student.id}
            due={ledger.data?.balancePiastres ?? 0}
            onPaid={onPaid}
          />
        </>
      )}
    </div>
  );
}
