import { useState, type FormEvent } from 'react';
import { ArrowDown, ArrowUp, BookOpen, GraduationCap, MoreHorizontal, Plus } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import {
  type CurriculumEntry,
  useCreateGradeLevelMutation,
  useCreateSubjectMutation,
  useGetCurrentWorkspaceQuery,
  useListGradeLevelsQuery,
  useListSubjectsQuery,
  useReorderGradeLevelsMutation,
  useReorderSubjectsMutation,
  useUpdateGradeLevelMutation,
  useUpdateSubjectMutation,
} from '@/api/generated';
import { Field, FormError, Skeleton } from '@/components/Field';
import { PageHeader, Sheet } from '@/components/Page';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { itemName } from '@/lib/groups';
import { errorKey } from '@/lib/session';
import { cn } from '@/lib/utils';

type Kind = 'subjects' | 'grades';

/** Same body for subjects and grade levels; only the endpoints differ. */
function useKind(kind: Kind) {
  const subjects = useListSubjectsQuery(undefined, { skip: kind !== 'subjects' });
  const grades = useListGradeLevelsQuery(undefined, { skip: kind !== 'grades' });
  const [createSubject, subjectCreated] = useCreateSubjectMutation();
  const [createGrade, gradeCreated] = useCreateGradeLevelMutation();
  const [updateSubject, subjectUpdated] = useUpdateSubjectMutation();
  const [updateGrade, gradeUpdated] = useUpdateGradeLevelMutation();
  const [reorderSubjects, subjectsReordered] = useReorderSubjectsMutation();
  const [reorderGrades, gradesReordered] = useReorderGradeLevelsMutation();
  const s = kind === 'subjects';
  return {
    list: s ? subjects : grades,
    create: (nameAr: string, nameEn?: string) =>
      s
        ? createSubject({ createCurriculumRequest: { nameAr, nameEn } })
        : createGrade({ createCurriculumRequest: { nameAr, nameEn } }),
    created: s ? subjectCreated : gradeCreated,
    update: (
      id: string,
      body: { nameAr?: string; nameEn?: string; status?: 'active' | 'archived' },
    ) =>
      s
        ? updateSubject({ id, updateCurriculumRequest: body })
        : updateGrade({ id, updateCurriculumRequest: body }),
    updated: s ? subjectUpdated : gradeUpdated,
    reorder: (ids: string[]) =>
      s
        ? reorderSubjects({ reorderCurriculumRequest: { ids } })
        : reorderGrades({ reorderCurriculumRequest: { ids } }),
    reordered: s ? subjectsReordered : gradesReordered,
  };
}

/** The workspace's own subjects and grade levels: everyone reads, the owner adds, renames, archives. */
export default function Curriculum() {
  const { t } = useTranslation();
  const isOwner = useGetCurrentWorkspaceQuery().data?.role === 'owner';
  const [kind, setKind] = useState<Kind>('subjects');
  const [adding, setAdding] = useState(false);
  const addLabel = t(kind === 'subjects' ? 'curriculum.addSubject' : 'curriculum.addGrade');

  return (
    <div className="grid gap-5">
      <PageHeader
        title={t('curriculum.title')}
        action={
          isOwner && (
            <Button onClick={() => setAdding(true)}>
              <Plus aria-hidden />
              {addLabel}
            </Button>
          )
        }
      />
      <div role="group" aria-label={t('curriculum.title')} className="flex gap-2">
        {(['subjects', 'grades'] as const).map((k) => (
          <button
            key={k}
            type="button"
            aria-pressed={kind === k}
            onClick={() => setKind(k)}
            className={cn(
              'h-9 rounded-full border px-4 text-sm font-medium transition-colors',
              kind === k
                ? 'border-ink bg-ink text-primary-foreground'
                : 'bg-card hover:bg-ink-soft',
            )}
          >
            {t(`curriculum.${k}`)}
          </button>
        ))}
      </div>
      <Sheet open={adding} onClose={() => setAdding(false)} title={addLabel}>
        <ItemForm kind={kind} onDone={() => setAdding(false)} />
      </Sheet>
      <ItemList kind={kind} canEdit={isOwner} />
      <p className="text-xs text-muted-foreground">{t('curriculum.hint')}</p>
    </div>
  );
}

function ItemList({ kind, canEdit }: { kind: Kind; canEdit: boolean }) {
  const { t } = useTranslation();
  const { list, reorder, reordered } = useKind(kind);
  if (list.isLoading) return <Skeleton />;
  if (list.error) return <FormError message={t(errorKey(list.error))} />;
  const items = list.data!;
  /** Swaps the item with its neighbour; the API takes the whole list in its new order. */
  const move = (index: number, delta: -1 | 1) => {
    const ids = items.map((i) => i.id);
    [ids[index], ids[index + delta]] = [ids[index + delta]!, ids[index]!];
    void reorder(ids);
  };
  return (
    <Card>
      <CardContent className="p-0">
        {list.data!.length === 0 ? (
          <p className="p-4 text-muted-foreground">
            {t(kind === 'subjects' ? 'curriculum.emptySubjects' : 'curriculum.emptyGrades')}
          </p>
        ) : (
          <ul className="divide-y" aria-label={t(`curriculum.${kind}`)}>
            {items.map((item, index) => (
              <ItemRow
                key={item.id}
                kind={kind}
                item={item}
                canEdit={canEdit}
                moving={reordered.isLoading}
                onUp={index > 0 ? () => move(index, -1) : undefined}
                onDown={index < items.length - 1 ? () => move(index, 1) : undefined}
              />
            ))}
          </ul>
        )}
        {reordered.error && <FormError message={t(errorKey(reordered.error))} />}
      </CardContent>
    </Card>
  );
}

/** New subject or grade, or (with `item`) rename one. */
function ItemForm({
  kind,
  item,
  onDone,
}: {
  kind: Kind;
  item?: CurriculumEntry;
  onDone: () => void;
}) {
  const { t } = useTranslation();
  const { create, created, update, updated } = useKind(kind);
  const [nameAr, setNameAr] = useState(item?.nameAr ?? '');
  const [nameEn, setNameEn] = useState(item?.nameEn ?? '');
  const [invalid, setInvalid] = useState(false);
  const error = item ? updated.error : created.error;

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    const ar = nameAr.trim();
    const en = nameEn.trim();
    if (!ar || ar.length > 60 || en.length > 60) return setInvalid(true);
    setInvalid(false);
    const res = item
      ? await update(item.id, { nameAr: ar, nameEn: en || ar })
      : await create(ar, en || undefined);
    if (res.error) return;
    onDone();
  };

  return (
    <form onSubmit={submit} noValidate className="grid gap-3">
      <Field
        label={t('curriculum.nameAr')}
        value={nameAr}
        maxLength={60}
        onChange={(e) => setNameAr(e.target.value)}
      />
      <Field
        label={`${t('curriculum.nameEn')} ${t('form.optional')}`}
        hint={t('curriculum.nameEnHint')}
        lang="en"
        dir="ltr"
        value={nameEn}
        maxLength={60}
        onChange={(e) => setNameEn(e.target.value)}
      />
      <FormError
        message={invalid ? t('curriculum.invalid') : error ? t(errorKey(error)) : undefined}
      />
      <Button type="submit" disabled={created.isLoading || updated.isLoading}>
        {item
          ? t('curriculum.save')
          : t(kind === 'subjects' ? 'curriculum.addSubject' : 'curriculum.addGrade')}
      </Button>
    </form>
  );
}

function ItemRow({
  kind,
  item,
  canEdit,
  moving,
  onUp,
  onDown,
}: {
  kind: Kind;
  item: CurriculumEntry;
  canEdit: boolean;
  moving: boolean;
  onUp?: () => void;
  onDown?: () => void;
}) {
  const { t, i18n } = useTranslation();
  const [editing, setEditing] = useState(false);
  const [menu, setMenu] = useState(false);
  const { update, updated } = useKind(kind);
  const archived = item.status === 'archived';
  const name = itemName(item, i18n.language);
  const other = i18n.language === 'en' ? item.nameAr : item.nameEn;
  const Icon = kind === 'subjects' ? BookOpen : GraduationCap;
  if (editing)
    return (
      <li className="p-4">
        <ItemForm kind={kind} item={item} onDone={() => setEditing(false)} />
      </li>
    );

  return (
    <li className={cn('flex flex-wrap items-center gap-3 px-4 py-3', archived && 'opacity-60')}>
      <Icon className="size-5 shrink-0 text-ink" aria-hidden />
      <div className="grid min-w-0 flex-1">
        <span className="truncate font-medium">{name}</span>
        <span className="text-sm text-muted-foreground">
          {other !== name && <bdi>{other}</bdi>}
          {other !== name && archived && ' · '}
          {archived && t('curriculum.archived')}
        </span>
      </div>
      {canEdit && (
        <div className="flex items-center gap-1">
          {menu && (
            <>
              <Button variant="ghost" size="sm" onClick={() => setEditing(true)}>
                {t('curriculum.edit')}
              </Button>
              <Button
                variant="ghost"
                size="sm"
                disabled={updated.isLoading}
                onClick={() => void update(item.id, { status: archived ? 'active' : 'archived' })}
              >
                {t(archived ? 'curriculum.restore' : 'curriculum.archive')}
              </Button>
            </>
          )}
          <Button
            variant="ghost"
            size="icon-sm"
            aria-label={t('curriculum.moveUp', { name })}
            disabled={!onUp || moving}
            onClick={onUp}
          >
            <ArrowUp aria-hidden />
          </Button>
          <Button
            variant="ghost"
            size="icon-sm"
            aria-label={t('curriculum.moveDown', { name })}
            disabled={!onDown || moving}
            onClick={onDown}
          >
            <ArrowDown aria-hidden />
          </Button>
          <Button
            variant="ghost"
            size="icon-sm"
            aria-label={t('curriculum.actions', { name })}
            aria-expanded={menu}
            onClick={() => setMenu(!menu)}
          >
            <MoreHorizontal aria-hidden />
          </Button>
        </div>
      )}
      {updated.error && <FormError message={t(errorKey(updated.error))} />}
    </li>
  );
}
