import { Check, Plus } from 'lucide-react';
import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Navigate } from 'react-router';
import { getWorkspaceId } from '@/api/base';
import { useListWorkspacesQuery } from '@/api/generated';
import { CreateWorkspace } from '@/components/CreateWorkspace';
import { FormError, Skeleton } from '@/components/Field';
import { Avatar, PageHeader, Sheet } from '@/components/Page';
import { Button } from '@/components/ui/button';
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
  // No workspace yet: the welcome screen asks center or independent teacher (audit 3 A6).
  if (list.data?.length === 0) return <Navigate to="/welcome" replace />;

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
