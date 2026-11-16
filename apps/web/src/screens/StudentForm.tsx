import {
  createStudentRequest,
  normalizeArabic,
  type Student,
  studentStatus,
} from '@dafter/contracts';
import { zodResolver } from '@hookform/resolvers/zod';
import { ChevronDown } from 'lucide-react';
import { useState } from 'react';
import { useForm } from 'react-hook-form';
import { useTranslation } from 'react-i18next';
import { Link, useNavigate, useParams } from 'react-router';
import * as z from 'zod';
import {
  useCreateEnrollmentMutation,
  useCreateStudentMutation,
  useGetStudentQuery,
  useListGradeLevelsQuery,
  useListGroupsQuery,
  useListStudentsQuery,
  useUpdateStudentMutation,
} from '@/api/generated';
import { Field, FormError, SelectField, Skeleton } from '@/components/Field';
import { AppAccess, Enrollments, GroupFullConfirm } from '@/components/StudentAccount';
import { StudentFees } from '@/components/StudentFees';
import { PageHeader } from '@/components/Page';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { groupName, itemName } from '@/lib/groups';
import { errorDetails, errorKey } from '@/lib/session';

const formSchema = createStudentRequest.extend({ status: studentStatus.optional() });
type FormValues = z.infer<typeof formSchema>;

const toForm = (s: Student): FormValues => {
  const g = s.guardians.find((x) => x.isPrimary) ?? s.guardians[0];
  return {
    nameAr: s.nameAr,
    nameEn: s.nameEn ?? undefined,
    phone: s.phone ?? undefined,
    gradeLevelId: s.gradeLevel.id,
    school: s.school ?? undefined,
    status: s.status,
    guardian: {
      phone: g?.phone ?? '',
      name: g?.name ?? undefined,
      relation: g?.relation ?? 'father',
      preferredLocale: g?.preferredLocale ?? 'ar',
      whatsappOptIn: g?.whatsappOptIn ?? true,
    },
  };
};

const blank = {
  guardian: { relation: 'father', preferredLocale: 'ar', whatsappOptIn: true },
} as const;

// Empty optional text is "not given"; phones accept Arabic digits typed on an Arabic keyboard.
const optional = (v: string) => v.trim() || undefined;
const phone = (v: string) => normalizeArabic(v).replace(/\s/g, '');
const optionalPhone = (v: string) => phone(v) || undefined;

/** Create (/students/new) and edit (/students/:id) one student and their primary parent. */
export default function StudentForm() {
  const { t } = useTranslation();
  const { id } = useParams();
  const existing = useGetStudentQuery({ id: id! }, { skip: !id });
  const grades = useListGradeLevelsQuery();
  // The id being edited, so moving to a sibling's page opens their summary, not the form.
  const [editing, setEditing] = useState<string>();
  // Wait for the grades too: a <select> mounted before its options shows the saved grade as empty.
  if ((id && existing.isLoading) || grades.isLoading) return <Skeleton />;
  if (id && existing.error) return <FormError message={t(errorKey(existing.error))} />;
  if (!id || !existing.data) return <StudentFormBody />;
  // Mounted once the student is loaded, so the form's default values are the student's.
  // Two columns on a laptop: who and where on one side, money on the other (audit 3 S9).
  return (
    <>
      <SectionChips />
      <div className="grid gap-4 lg:grid-cols-2 lg:items-start">
        <div className="grid gap-4">
          {editing === id ? (
            <StudentFormBody
              key={id}
              id={id}
              student={existing.data}
              onDone={() => setEditing(undefined)}
            />
          ) : (
            <StudentSummary student={existing.data} onEdit={() => setEditing(id)} />
          )}
          <div id="student-groups" className="scroll-mt-4">
            <Enrollments studentId={id} />
          </div>
          <div id="student-app" className="scroll-mt-4">
            <AppAccess student={existing.data} />
          </div>
        </div>
        <div id="student-fees" className="scroll-mt-4">
          <StudentFees studentId={id} />
        </div>
      </div>
    </>
  );
}

const SECTIONS = ['groups', 'fees', 'app'] as const;

/** Jumps down to a card: on a phone the fees sit three screens below (audit ST3). */
function SectionChips() {
  const { t } = useTranslation();
  return (
    // Both columns fit on a laptop, so the jumps are for phones only.
    <nav
      aria-label={t('students.sections.label')}
      className="flex flex-wrap gap-2 print:hidden lg:hidden"
    >
      {SECTIONS.map((s) => (
        <button
          key={s}
          type="button"
          onClick={() =>
            document.getElementById(`student-${s}`)?.scrollIntoView({ behavior: 'smooth' })
          }
          className="h-9 rounded-full border bg-card px-4 text-sm font-medium transition-colors hover:bg-ink-soft"
        >
          {t(`students.sections.${s}`)}
        </button>
      ))}
    </nav>
  );
}

/** The student at a glance; the edit form opens on demand. */
function StudentSummary({ student, onEdit }: { student: Student; onEdit: () => void }) {
  const { t, i18n } = useTranslation();
  const g = student.guardians.find((x) => x.isPrimary) ?? student.guardians[0];
  const name = i18n.language === 'en' && student.nameEn ? student.nameEn : student.nameAr;
  return (
    <Card>
      <CardHeader className="flex flex-row items-start justify-between gap-2">
        <div className="grid gap-1">
          <CardTitle>
            <h1 className="text-xl">
              <bdi>{name}</bdi>
            </h1>
          </CardTitle>
          <p className="text-sm text-muted-foreground">
            {itemName(student.gradeLevel, i18n.language)}
            {student.status === 'archived' && ` · ${t('students.statuses.archived')}`}
          </p>
        </div>
        <Button variant="outline" size="sm" onClick={onEdit}>
          {t('students.edit')}
        </Button>
      </CardHeader>
      <CardContent>
        <dl className="grid grid-cols-[auto_1fr] gap-x-4 gap-y-2 text-sm">
          {student.phone && (
            <>
              <dt className="text-muted-foreground">{t('students.phone')}</dt>
              <dd>
                <bdi>{student.phone}</bdi>
              </dd>
            </>
          )}
          {g && (
            <>
              <dt className="text-muted-foreground">{t('students.guardian')}</dt>
              <dd>
                {g.name && `${g.name} · `}
                <bdi>{g.phone}</bdi>
              </dd>
            </>
          )}
        </dl>
      </CardContent>
    </Card>
  );
}

function StudentFormBody({
  id,
  student,
  onDone,
}: {
  id?: string;
  student?: Student;
  onDone?: () => void;
}) {
  const { t, i18n } = useTranslation();
  const navigate = useNavigate();
  const grades = useListGradeLevelsQuery();
  const [create, created] = useCreateStudentMutation();
  const [update, updated] = useUpdateStudentMutation();
  // New students only: register and put them in a group with one submit.
  const groups = useListGroupsQuery(undefined, { skip: !!id });
  const [enroll, enrolled] = useCreateEnrollmentMutation();
  const [groupId, setGroupId] = useState('');
  const [discount, setDiscount] = useState('');
  const pct = Number(discount || 0);
  // Set when the student was saved but their group is full: confirm, or go on without it.
  const [savedId, setSavedId] = useState<string>();
  const full = errorDetails(enrolled.error, 'GROUP_FULL');
  const saving = created.isLoading || updated.isLoading || enrolled.isLoading;
  const error = created.error ?? updated.error;

  const { register, handleSubmit, watch, setValue, formState } = useForm<FormValues>({
    resolver: zodResolver(formSchema),
    defaultValues: student ? toForm(student) : blank,
  });
  const { errors } = formState;

  const onSubmit = handleSubmit(async (body) => {
    // Already saved and waiting on the full-group confirm: Enter must not register them twice.
    if (pct > 100 || savedId) return;
    const res = id
      ? await update({
          id,
          // Cleared optional fields are sent as null so the API clears them.
          updateStudentRequest: {
            ...body,
            nameEn: body.nameEn ?? null,
            phone: body.phone ?? null,
            school: body.school ?? null,
          },
        })
      : await create({ createStudentRequest: body });
    // A new student opens on their page, ready to enroll; an edit goes back to the summary.
    if (res.data) {
      if (id) return onDone?.();
      // The student exists either way: a failed enrolment is reported on their page, where the
      // group card can retry it (resubmitting this form would register them twice).
      if (groupId) await join(res.data.id);
      else void navigate(`/students/${res.data.id}`);
    }
  });

  const join = async (studentId: string, force?: true) => {
    const joined = await enroll({
      id: studentId,
      createEnrollmentRequest: { groupId, discountPct: pct, force },
    });
    if (errorDetails(joined.error, 'GROUP_FULL')) return setSavedId(studentId);
    void navigate(`/students/${studentId}`, {
      state: joined.error ? { enrollError: errorKey(joined.error) } : undefined,
    });
  };

  return (
    <div className="grid gap-5">
      <PageHeader title={t(id ? 'students.edit' : 'students.new')} />
      <Card>
        <form onSubmit={onSubmit} noValidate>
          <CardContent className="grid gap-4">
            <Field
              label={t('students.nameAr')}
              autoComplete="off"
              error={errors.nameAr && t('form.invalid.name')}
              {...register('nameAr')}
            />
            <Field
              label={t('students.phone')}
              type="tel"
              inputMode="tel"
              dir="ltr"
              autoComplete="off"
              error={errors.phone && t('form.invalid.mobile')}
              {...register('phone', { setValueAs: optionalPhone })}
            />
            <PhoneMatches
              phone={watch('phone')}
              selfId={id}
              message={t('students.duplicatePhone')}
            />
            {!id && !!groups.data?.length && (
              <SelectField
                label={`${t('enrollments.group')} ${t('form.optional')}`}
                value={groupId}
                onChange={(ev) => {
                  setGroupId(ev.target.value);
                  const g = groups.data?.find((x) => x.id === ev.target.value);
                  // The group decides the grade, so the next field is already right.
                  if (g) setValue('gradeLevelId', g.gradeLevel.id, { shouldValidate: true });
                }}
              >
                <option value="">{t('form.choose')}</option>
                {groups.data
                  .filter((g) => g.status === 'active')
                  .map((g) => (
                    <option key={g.id} value={g.id}>
                      {groupName(g, i18n.language, true)}
                    </option>
                  ))}
              </SelectField>
            )}
            {groupId && (
              <Field
                label={`${t('enrollments.discount')} ${t('form.optional')}`}
                inputMode="numeric"
                dir="ltr"
                value={discount}
                onChange={(ev) => setDiscount(ev.target.value.replace(/\D/g, '').slice(0, 3))}
                error={pct > 100 ? t('form.invalid.discount') : undefined}
              />
            )}
            <SelectField
              label={t('students.gradeLevel')}
              error={errors.gradeLevelId && t('form.invalid.gradeLevel')}
              {...register('gradeLevelId')}
              // Controlled, so a grade set from the chosen group shows in the dropdown.
              value={watch('gradeLevelId') ?? ''}
            >
              <option value="">{t('form.choose')}</option>
              {grades.data?.map((g) => (
                <option key={g.id} value={g.id}>
                  {itemName(g, i18n.language)}
                </option>
              ))}
            </SelectField>

            <Field
              label={t('students.guardianPhone')}
              type="tel"
              inputMode="tel"
              dir="ltr"
              autoComplete="off"
              error={errors.guardian?.phone && t('form.invalid.mobile')}
              {...register('guardian.phone', { setValueAs: phone })}
            />
            <PhoneMatches
              phone={watch('guardian.phone')}
              selfId={id}
              message={t('students.sharedGuardian')}
            />

            {/* At the door only the four fields above matter; the rest can wait. Open when editing,
              or when a field inside needs fixing. */}
            <details
              open={!!id || !!(errors.guardian?.name || errors.nameEn)}
              className="group rounded-xl border bg-muted/40 px-3 py-2 [&[open]]:pb-3"
            >
              <summary className="flex min-h-10 cursor-pointer list-none items-center justify-between gap-2 text-sm font-medium">
                {t('students.more')}
                <ChevronDown
                  aria-hidden
                  className="size-4 text-muted-foreground transition-transform group-open:rotate-180"
                />
              </summary>
              <div className="grid gap-4 pt-2">
                <Field
                  label={`${t('students.guardianName')} ${t('form.optional')}`}
                  autoComplete="off"
                  error={errors.guardian?.name && t('form.invalid.name')}
                  {...register('guardian.name', { setValueAs: optional })}
                />
                <div className="grid grid-cols-2 gap-2">
                  <SelectField label={t('students.relation')} {...register('guardian.relation')}>
                    {(['father', 'mother', 'other'] as const).map((r) => (
                      <option key={r} value={r}>
                        {t(`students.relations.${r}`)}
                      </option>
                    ))}
                  </SelectField>
                  <SelectField
                    label={t('students.preferredLocale')}
                    {...register('guardian.preferredLocale')}
                  >
                    <option value="ar">{t('students.locales.ar')}</option>
                    <option value="en">{t('students.locales.en')}</option>
                  </SelectField>
                </div>
                <label className="flex items-center gap-2 text-sm">
                  <input
                    type="checkbox"
                    className="size-4"
                    {...register('guardian.whatsappOptIn')}
                  />
                  {t('students.whatsappOptIn')}
                </label>
                <Field
                  label={`${t('students.nameEn')} ${t('form.optional')}`}
                  dir="auto"
                  autoComplete="off"
                  error={errors.nameEn && t('form.invalid.name')}
                  {...register('nameEn', { setValueAs: optional })}
                />
                <Field
                  label={`${t('students.school')} ${t('form.optional')}`}
                  autoComplete="off"
                  {...register('school', { setValueAs: optional })}
                />
                {id && (
                  <SelectField label={t('students.status')} {...register('status')}>
                    <option value="active">{t('students.statuses.active')}</option>
                    <option value="archived">{t('students.statuses.archived')}</option>
                  </SelectField>
                )}
              </div>
            </details>

            <FormError message={error && t(errorKey(error))} />
            {full && savedId ? (
              <GroupFullConfirm
                full={full}
                busy={enrolled.isLoading}
                onConfirm={() => void join(savedId, true)}
                onCancel={() => void navigate(`/students/${savedId}`)}
              />
            ) : (
              <Button type="submit" disabled={saving}>
                {t(id ? 'students.save' : 'students.create')}
              </Button>
            )}
            {onDone && (
              <Button type="button" variant="ghost" onClick={onDone}>
                {t('students.cancelEdit')}
              </Button>
            )}
          </CardContent>
        </form>
      </Card>
    </div>
  );
}

/** Duplicate warning: other students already using a full mobile number. Saving still works. */
function PhoneMatches({
  phone,
  selfId,
  message,
}: {
  phone?: string;
  selfId?: string;
  message: string;
}) {
  const { i18n } = useTranslation();
  const valid = !!phone && /^01\d{9}$/.test(phone);
  const matches = useListStudentsQuery({ q: phone }, { skip: !valid }).data?.filter(
    (s) => s.id !== selfId,
  );
  if (!valid || !matches?.length) return null;
  return (
    <div role="status" className="rounded-md bg-amber-50 p-3 text-sm text-amber-900">
      <p>{message}</p>
      <ul className="mt-1 grid gap-1">
        {matches.map((s) => (
          <li key={s.id}>
            <Link to={`/students/${s.id}`} className="underline">
              {i18n.language === 'en' && s.nameEn ? s.nameEn : s.nameAr}
            </Link>
          </li>
        ))}
      </ul>
    </div>
  );
}
