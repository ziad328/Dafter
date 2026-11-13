import { createWorkspaceRequest, type CreateWorkspaceRequest } from '@dafter/contracts';
import { zodResolver } from '@hookform/resolvers/zod';
import { useForm } from 'react-hook-form';
import { useTranslation } from 'react-i18next';
import { getWorkspaceId } from '@/api/base';
import { useCreateWorkspaceMutation, useListWorkspacesQuery } from '@/api/generated';
import { Field, FormError, Skeleton } from '@/components/Field';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Label } from '@/components/ui/label';
import { errorKey, useSelectWorkspace, workspaceName } from '@/lib/session';

export default function Workspaces() {
  const { t, i18n } = useTranslation();
  const list = useListWorkspacesQuery();
  const select = useSelectWorkspace();
  const current = getWorkspaceId();

  if (list.isLoading) return <Skeleton />;

  return (
    <div className="grid gap-6">
      <Card>
        <CardHeader>
          <CardTitle>
            <h1>{t('workspaces.title')}</h1>
          </CardTitle>
        </CardHeader>
        <CardContent className="grid gap-2">
          <FormError message={list.error && t(errorKey(list.error))} />
          {list.data?.length === 0 && (
            <p className="text-sm text-muted-foreground">{t('workspaces.empty')}</p>
          )}
          {list.data?.map((ws) => (
            <Button
              key={ws.id}
              variant={ws.id === current ? 'default' : 'outline'}
              aria-current={ws.id === current}
              className="h-auto justify-between py-3"
              onClick={() => select(ws.id)}
            >
              <span>{workspaceName(ws, i18n.language)}</span>
              <span className="text-xs opacity-70">{t(`roles.${ws.role}`)}</span>
            </Button>
          ))}
        </CardContent>
      </Card>
      <CreateWorkspace onCreated={select} />
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
    <Card>
      <CardHeader>
        <CardTitle>
          <h2>{t('workspaces.create.title')}</h2>
        </CardTitle>
      </CardHeader>
      <form onSubmit={onSubmit} noValidate>
        <CardContent className="grid gap-4">
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
        </CardContent>
      </form>
    </Card>
  );
}
