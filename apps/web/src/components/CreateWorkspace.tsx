import { createWorkspaceRequest, type CreateWorkspaceRequest } from '@dafter/contracts';
import { zodResolver } from '@hookform/resolvers/zod';
import { Building2, UserRound } from 'lucide-react';
import { useForm } from 'react-hook-form';
import { useTranslation } from 'react-i18next';
import { useCreateWorkspaceMutation } from '@/api/generated';
import { Field, FormError } from '@/components/Field';
import { Button } from '@/components/ui/button';
import { errorKey } from '@/lib/session';
import { cn } from '@/lib/utils';

const TYPES = [
  { type: 'center', icon: Building2 },
  { type: 'independent', icon: UserRound },
] as const;

/**
 * A new workspace. The type comes first, as two cards, because it decides the wording that
 * follows; the English name waits under «تفاصيل أكثر» (audit 3 A7).
 */
export function CreateWorkspace({ onCreated }: { onCreated: (id: string) => void }) {
  const { t } = useTranslation();
  const [create, { error, isLoading }] = useCreateWorkspaceMutation();
  const { register, handleSubmit, formState, watch } = useForm<CreateWorkspaceRequest>({
    resolver: zodResolver(createWorkspaceRequest),
    defaultValues: { type: 'center' },
  });
  const type = watch('type');

  const onSubmit = handleSubmit(async (body) => {
    const created = await create({ createWorkspaceRequest: body });
    if (created.data) onCreated(created.data.id);
  });

  return (
    <form onSubmit={onSubmit} noValidate className="grid gap-4">
      <fieldset className="grid grid-cols-2 gap-3">
        <legend className="sr-only">{t('workspaces.create.type')}</legend>
        {TYPES.map(({ type: value, icon: Icon }) => (
          <label
            key={value}
            className={cn(
              'grid cursor-pointer justify-items-center gap-2 rounded-2xl border-2 bg-card p-4 text-center transition-colors has-focus-visible:ring-2 has-focus-visible:ring-ring',
              type === value ? 'border-ink bg-ink-soft/60' : 'border-border hover:border-ink/40',
            )}
          >
            <input type="radio" value={value} className="sr-only" {...register('type')} />
            <Icon className="size-7 text-ink" aria-hidden />
            <span className="font-semibold">{t(`workspaces.create.${value}`)}</span>
            <span className="text-xs text-muted-foreground">
              {t(`workspaces.create.${value}Hint`)}
            </span>
          </label>
        ))}
      </fieldset>
      <Field
        label={t(
          type === 'center' ? 'workspaces.create.centerName' : 'workspaces.create.teacherName',
        )}
        error={formState.errors.nameAr && t('form.invalid.nameAr')}
        {...register('nameAr')}
      />
      <details open={!!formState.errors.nameEn} className="group">
        <summary className="cursor-pointer text-sm font-medium text-muted-foreground">
          {t('students.more')}
        </summary>
        <div className="mt-3">
          <Field
            label={`${t('workspaces.create.nameEn')} ${t('form.optional')}`}
            dir="ltr"
            error={formState.errors.nameEn && t('form.invalid.nameAr')}
            // Empty must be undefined, or the min-length rule rejects "".
            {...register('nameEn', { setValueAs: (v: string) => v.trim() || undefined })}
          />
        </div>
      </details>
      <FormError message={error && t(errorKey(error))} />
      <Button type="submit" size="lg" disabled={isLoading}>
        {t('workspaces.create.submit')}
      </Button>
    </form>
  );
}
