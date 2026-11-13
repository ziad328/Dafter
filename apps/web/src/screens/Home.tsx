import { useTranslation } from 'react-i18next';
import { Link, Navigate } from 'react-router';
import { getWorkspaceId, setWorkspaceId } from '@/api/base';
import { useGetCurrentWorkspaceQuery } from '@/api/generated';
import { FormError, Skeleton } from '@/components/Field';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { errorKey, workspaceName } from '@/lib/session';

/** Placeholder home until Day 8: shows the active workspace. */
export default function Home() {
  const { t, i18n } = useTranslation();
  const hasWorkspace = !!getWorkspaceId();
  const current = useGetCurrentWorkspaceQuery(undefined, { skip: !hasWorkspace });

  const code = (current.error as { data?: { code?: string } } | undefined)?.data?.code;
  if (code === 'WORKSPACE_NOT_FOUND') setWorkspaceId(null); // removed, or another user's choice
  if (!hasWorkspace || code === 'WORKSPACE_NOT_FOUND') return <Navigate to="/workspaces" replace />;
  if (current.isLoading) return <Skeleton />;

  return (
    <Card>
      <CardHeader>
        <CardTitle>
          <h1>{current.data && workspaceName(current.data, i18n.language)}</h1>
        </CardTitle>
        {current.data && <CardDescription>{t(`roles.${current.data.role}`)}</CardDescription>}
      </CardHeader>
      <CardContent className="grid gap-4">
        <FormError message={current.error && t(errorKey(current.error))} />
        <Button asChild>
          <Link to="/timetable">{t('home.timetable')}</Link>
        </Button>
        <Button asChild variant="outline">
          <Link to="/students">{t('home.students')}</Link>
        </Button>
        <Button asChild variant="outline">
          <Link to="/groups">{t('home.groups')}</Link>
        </Button>
        <Button asChild variant="outline">
          <Link to="/workspaces">{t('home.switch')}</Link>
        </Button>
      </CardContent>
    </Card>
  );
}
