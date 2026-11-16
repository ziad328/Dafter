import { useTranslation } from 'react-i18next';
import { Navigate } from 'react-router';
import { useGetMeQuery, useListWorkspacesQuery } from '@/api/generated';
import { CreateWorkspace } from '@/components/CreateWorkspace';
import { Skeleton } from '@/components/Field';
import { useSelectWorkspace } from '@/lib/session';

/**
 * A new account's first screen (audit 3 A6): center or independent teacher, then a name. It sits
 * in the plain layout, whose header has the language switch and sign-out.
 */
export default function Welcome() {
  const { t } = useTranslation();
  const me = useGetMeQuery();
  const list = useListWorkspacesQuery();
  const select = useSelectWorkspace();
  if (list.isLoading) return <Skeleton />;
  // Already somewhere (an invite was accepted, or a second tab created one): go there.
  if (list.data?.length) return <Navigate to="/workspaces" replace />;
  return (
    <div className="grid gap-5">
      <header className="grid gap-1">
        <h1 className="text-2xl font-bold">{t('welcome.title', { name: me.data?.name ?? '' })}</h1>
        <p className="text-muted-foreground">{t('welcome.body')}</p>
      </header>
      <CreateWorkspace onCreated={select} />
    </div>
  );
}
