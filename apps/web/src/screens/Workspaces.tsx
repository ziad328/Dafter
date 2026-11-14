import { createWorkspaceRequest, type CreateWorkspaceRequest } from '@dafter/contracts';
import { zodResolver } from '@hookform/resolvers/zod';
import { Check, Plus } from 'lucide-react';
import { useEffect, useState } from 'react';
import { useForm } from 'react-hook-form';
import { useTranslation } from 'react-i18next';
import { getWorkspaceId } from '@/api/base';
import { useCreateWorkspaceMutation, useListWorkspacesQuery } from '@/api/generated';
import { Field, FormError, Skeleton } from '@/components/Field';
import { Avatar, PageHeader, Panel, Sheet } from '@/components/Page';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { errorKey, useSelectWorkspace, workspaceName } from '@/lib/session';
import { cn } from '@/lib/utils';

export default function Workspaces() {
  const { t, i18n } = useTranslation();
  const list = useListWorkspacesQuery();
  const select = useSelectWorkspace();
  const current = getWorkspaceId();
  const [creating, setCreating] = useState(false);
  const only = list.data?.length === 1 ? list.data[0]!.id : undefined;
  // Most staff work in one place: skip this screen for them on first sign-in.
  useEffect(() => {
    if (!current && only) select(only);
  }, [current, only, select]);

  if (list.isLoading || (!current && only)) return <Skeleton />;

  return (
    <div className="grid gap-5">
      <PageHeader
        title={t('workspaces.title')}
        action={
          <Button variant="outline" onClick={() => setCreating(true)}>
            <Plus aria-hidden />
            {t('workspaces.create.title')}
          </Button>
        }
      />
      <FormError message={list.error && t(errorKey(list.error))} />
      {list.data?.length === 0 && (
        <Panel className="p-8 text-center text-muted-foreground">{t('workspaces.empty')}</Panel>
      )}
      <ul className="grid gap-3 sm:grid-cols-2">
        {list.data?.map((ws) => {
          const name = workspaceName(ws, i18n.language);
          const here = ws.id === current;
          return (
            <li key={ws.id}>
              <button
                type="button"
                aria-current={here}
                onClick={() => select(ws.id)}
                className={cn(
                  'flex w-full items-center gap-3 rounded-2xl border bg-card p-4 text-start shadow-card transition-all hover:-translate-y-0.5 hover:border-ink/40 focus-visible:outline-2',
                  here && 'border-ink ring-2 ring-ink/20',
                )}
              >
                <Avatar name={name} className="size-12 rounded-xl" />
                <span className="grid min-w-0 flex-1">
                  <span className="truncate font-semibold">{name}</span>
                  <span className="text-sm text-muted-foreground">{t(`roles.${ws.role}`)}</span>
                </span>
                {here && <Check className="size-5 text-ink" aria-hidden />}
              </button>
            </li>
          );
        })}
      </ul>
      <Sheet
        open={creating}
        onClose={() => setCreating(false)}
        title={t('workspaces.create.title')}
      >
        <CreateWorkspace onCreated={select} />
      </Sheet>
    </div>
  );
}

function CreateWorkspace({ onCreated }: { onCreated: (id: string) => void }) {
  const { t } = useTranslation();
  const [create, { error, isLoading }] = useCreateWorkspaceMutation();
  const { register, handleSubmit, formState } = useForm<CreateWorkspaceRequest>({
    resolver: zodResolver(createWorkspaceRequest),
    defaultValues: { type: 'center' },
  });

  const onSubmit = handleSubmit(async (body) => {
    const created = await create({ createWorkspaceRequest: body });
    if (created.data) onCreated(created.data.id);
  });

  return (
    <form onSubmit={onSubmit} noValidate className="grid gap-4">
      <Field
        label={t('workspaces.create.nameAr')}
        error={formState.errors.nameAr && t('form.invalid.nameAr')}
        {...register('nameAr')}
      />
      <Field
        label={`${t('workspaces.create.nameEn')} ${t('form.optional')}`}
        dir="ltr"
        error={formState.errors.nameEn && t('form.invalid.nameAr')}
        // Empty must be undefined, or the min-length rule rejects "".
        {...register('nameEn', { setValueAs: (v: string) => v.trim() || undefined })}
      />
      <fieldset className="grid gap-2">
        <legend className="mb-2 text-sm font-medium">{t('workspaces.create.type')}</legend>
        {(['center', 'independent'] as const).map((type) => (
          <Label key={type} className="font-normal">
            <input type="radio" value={type} className="accent-primary" {...register('type')} />
            {t(`workspaces.create.${type}`)}
          </Label>
        ))}
      </fieldset>
      <FormError message={error && t(errorKey(error))} />
      <Button type="submit" disabled={isLoading}>
        {t('workspaces.create.submit')}
      </Button>
    </form>
  );
}
