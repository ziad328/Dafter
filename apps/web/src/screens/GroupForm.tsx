import { createGroupRequest, type CreateGroupRequest, type Group } from '@dafter/contracts';
import { zodResolver } from '@hookform/resolvers/zod';
import { useFieldArray, useForm, type FieldError } from 'react-hook-form';
import { useTranslation } from 'react-i18next';
import { useNavigate, useParams } from 'react-router';
import {
  useCreateGroupMutation,
  useGetCurrentWorkspaceQuery,
  useGetGroupQuery,
  useListGradeLevelsQuery,
  useListMembersQuery,
  useListSubjectsQuery,
  useUpdateGroupMutation,
} from '@/api/generated';
import { Field, FormError, SelectField, Skeleton } from '@/components/Field';
import { PageHeader } from '@/components/Page';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { itemName, WEEK, weekdayName } from '@/lib/groups';
import { egpText, toPiastres } from '@/lib/money';
import { errorKey } from '@/lib/session';

const toForm = (g: Group): CreateGroupRequest => ({
  teacherMembershipId: g.teacherMembershipId,
  subjectId: g.subject.id,
  gradeLevelId: g.gradeLevel.id,
  capacity: g.capacity,
  slots: g.slots,
});

const blankSlot = { weekday: 6, startTime: '16:00', endTime: '17:30' };

/** Create (/groups/new) and edit (/groups/:id) one group. */
export default function GroupForm() {
  const { t } = useTranslation();
  const { id } = useParams();
  const existing = useGetGroupQuery({ id: id! }, { skip: !id });
  const isOwner = useGetCurrentWorkspaceQuery().data?.role === 'owner';
  // Wait for the option lists too: a <select> mounted before its options shows the saved value
  // as empty, and saving would then send it empty.
  const lists = [
    useListSubjectsQuery(),
    useListGradeLevelsQuery(),
    useListMembersQuery(undefined, { skip: !isOwner }),
  ];
  if ((id && existing.isLoading) || lists.some((l) => l.isLoading)) return <Skeleton />;
  if (id && existing.error) return <FormError message={t(errorKey(existing.error))} />;
  // Mounted once the group is loaded, so the form's default values are the group's.
  return <GroupFormBody id={id} group={existing.data} />;
}

function GroupFormBody({ id, group }: { id?: string; group?: Group }) {
  const { t, i18n } = useTranslation();
  const lang = i18n.language;
  const navigate = useNavigate();
  const isOwner = useGetCurrentWorkspaceQuery().data?.role === 'owner';
  const subjects = useListSubjectsQuery();
  const grades = useListGradeLevelsQuery();
  const members = useListMembersQuery(undefined, { skip: !isOwner });
  const [create, created] = useCreateGroupMutation();
  const [update, updated] = useUpdateGroupMutation();
  const saving = created.isLoading || updated.isLoading;
  const error = created.error ?? updated.error;

  const { register, control, handleSubmit, formState } = useForm<CreateGroupRequest>({
    resolver: zodResolver(createGroupRequest),
    defaultValues: group ? toForm(group) : { slots: [blankSlot] },
  });
  const slots = useFieldArray({ control, name: 'slots' });
  const { errors } = formState;

  const onSubmit = handleSubmit(async (body) => {
    const res = id
      ? await update({ id, updateGroupRequest: body })
      : await create({ createGroupRequest: body });
    if (res.data) void navigate('/groups');
  });

  // Zod messages are our own codes (SLOT_OVERLAP, SLOT_ENDS_BEFORE_START), never shown raw.
  const slotError = (e?: FieldError) =>
    e &&
    t(
      e.message === 'SLOT_OVERLAP'
        ? 'form.invalid.slotOverlap'
        : e.message === 'SLOT_ENDS_BEFORE_START'
          ? 'form.invalid.slotOrder'
          : 'form.invalid.slot',
    );

  return (
    <div className="grid gap-5">
      <PageHeader title={t(id ? 'groups.edit' : 'groups.new')} />
      <Card>
        <form onSubmit={onSubmit} noValidate>
          <CardContent className="grid gap-4">
            <SelectField
              label={t('groups.subject')}
              error={errors.subjectId && t('form.invalid.subject')}
              {...register('subjectId')}
            >
              <option value="">{t('form.choose')}</option>
              {subjects.data?.map((s) => (
                <option key={s.id} value={s.id}>
                  {itemName(s, lang)}
                </option>
              ))}
            </SelectField>
            <SelectField
              label={t('groups.gradeLevel')}
              error={errors.gradeLevelId && t('form.invalid.gradeLevel')}
              {...register('gradeLevelId')}
            >
              <option value="">{t('form.choose')}</option>
              {grades.data?.map((g) => (
                <option key={g.id} value={g.id}>
                  {itemName(g, lang)}
                </option>
              ))}
            </SelectField>
            {isOwner && (
              <SelectField
                label={t('groups.teacher')}
                {...register('teacherMembershipId', { setValueAs: (v: string) => v || undefined })}
              >
                {/* Empty = the owner teaches it (the API defaults to the caller). */}
                <option value="">{t('groups.me')}</option>
                {members.data
                  ?.filter((m) => m.role !== 'assistant')
                  .map((m) => (
                    <option key={m.id} value={m.id}>
                      {m.name}
                    </option>
                  ))}
              </SelectField>
            )}
            <Field
              label={`${t('groups.capacity')} ${t('form.optional')}`}
              type="number"
              inputMode="numeric"
              dir="ltr"
              error={errors.capacity && t('form.invalid.capacity')}
              {...register('capacity', {
                setValueAs: (v: string) => (v === '' ? null : Number(v)),
              })}
            />
            <Field
              label={`${t('groups.monthlyFee')} ${t('form.optional')}`}
              inputMode="decimal"
              dir="ltr"
              defaultValue={group?.monthlyFeePiastres ? egpText(group.monthlyFeePiastres) : ''}
              error={errors.monthlyFeePiastres && t('form.invalid.amount')}
              // EGP typed, piastres sent; -1 fails validation for text that is not an amount.
              {...register('monthlyFeePiastres', {
                setValueAs: (v: string) => (v === '' ? null : (toPiastres(v) ?? -1)),
              })}
            />

            <fieldset className="grid gap-3">
              <legend className="mb-2 text-sm font-medium">{t('groups.slots')}</legend>
              {slots.fields.map((field, i) => {
                const e = errors.slots?.[i];
                return (
                  <div key={field.id} className="grid gap-2 rounded-md border p-3">
                    <SelectField
                      label={t('groups.day')}
                      {...register(`slots.${i}.weekday`, { valueAsNumber: true })}
                    >
                      {WEEK.map((d) => (
                        <option key={d} value={d}>
                          {weekdayName(lang, d)}
                        </option>
                      ))}
                    </SelectField>
                    <div className="grid grid-cols-2 gap-2">
                      <Field
                        label={t('groups.start')}
                        type="time"
                        dir="ltr"
                        {...register(`slots.${i}.startTime`)}
                      />
                      <Field
                        label={t('groups.end')}
                        type="time"
                        dir="ltr"
                        {...register(`slots.${i}.endTime`)}
                      />
                    </div>
                    <FormError
                      message={slotError((e?.root ?? e?.endTime ?? e?.startTime) as FieldError)}
                    />
                    {slots.fields.length > 1 && (
                      <Button
                        type="button"
                        variant="ghost"
                        size="sm"
                        className="justify-self-start"
                        onClick={() => slots.remove(i)}
                      >
                        {t('groups.removeSlot')}
                      </Button>
                    )}
                  </div>
                );
              })}
              <Button type="button" variant="outline" onClick={() => slots.append(blankSlot)}>
                {t('groups.addSlot')}
              </Button>
            </fieldset>

            <FormError message={error && t(errorKey(error))} />
            <Button type="submit" disabled={saving}>
              {t(id ? 'groups.save' : 'groups.create')}
            </Button>
          </CardContent>
        </form>
      </Card>
    </div>
  );
}
