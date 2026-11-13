import {
  createStudentRequest,
  normalizeArabic,
  type Student,
  studentStatus,
} from '@dafter/contracts';
import { zodResolver } from '@hookform/resolvers/zod';
import { useForm } from 'react-hook-form';
import { useTranslation } from 'react-i18next';
import { Link, useNavigate, useParams } from 'react-router';
import * as z from 'zod';
import {
  useCreateStudentMutation,
  useGetStudentQuery,
  useListGradeLevelsQuery,
  useListStudentsQuery,
  useUpdateStudentMutation,
} from '@/api/generated';
import { Field, FormError, SelectField, Skeleton } from '@/components/Field';
import { AppAccess, Enrollments } from '@/components/StudentAccount';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { itemName } from '@/lib/groups';
import { errorKey } from '@/lib/session';

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
  if (id && existing.isLoading) return <Skeleton />;
  if (id && existing.error) return <FormError message={t(errorKey(existing.error))} />;
  // Mounted once the student is loaded, so the form's default values are the student's.
  return (
    <>
      <StudentFormBody key={id} id={id} student={existing.data} />
      {id && existing.data && (
        <>
          <Enrollments studentId={id} />
          <AppAccess student={existing.data} />
        </>
      )}
    </>
  );
}

function StudentFormBody({ id, student }: { id?: string; student?: Student }) {
  const { t, i18n } = useTranslation();
  const navigate = useNavigate();
  const grades = useListGradeLevelsQuery();
  const [create, created] = useCreateStudentMutation();
  const [update, updated] = useUpdateStudentMutation();
  const saving = created.isLoading || updated.isLoading;
  const error = created.error ?? updated.error;

  const { register, handleSubmit, watch, formState } = useForm<FormValues>({
    resolver: zodResolver(formSchema),
    defaultValues: student ? toForm(student) : blank,
  });
  const { errors } = formState;

  const onSubmit = handleSubmit(async (body) => {
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
    if (res.data) void navigate('/students');
  });

  return (
    <Card>
      <CardHeader>
        <CardTitle>
          <h1>{t(id ? 'students.edit' : 'students.new')}</h1>
        </CardTitle>
      </CardHeader>
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
          <PhoneMatches phone={watch('phone')} selfId={id} message={t('students.duplicatePhone')} />
          <SelectField
            label={t('students.gradeLevel')}
            error={errors.gradeLevelId && t('form.invalid.gradeLevel')}
            {...register('gradeLevelId')}
          >
            <option value="">{t('form.choose')}</option>
            {grades.data?.map((g) => (
              <option key={g.id} value={g.id}>
                {itemName(g, i18n.language)}
              </option>
            ))}
          </SelectField>

          <fieldset className="grid gap-3 rounded-md border p-3">
            <legend className="px-1 text-sm font-medium">{t('students.guardian')}</legend>
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
              <input type="checkbox" className="size-4" {...register('guardian.whatsappOptIn')} />
              {t('students.whatsappOptIn')}
            </label>
          </fieldset>

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

          <FormError message={error && t(errorKey(error))} />
          <Button type="submit" disabled={saving}>
            {t(id ? 'students.save' : 'students.create')}
          </Button>
        </CardContent>
      </form>
    </Card>
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
