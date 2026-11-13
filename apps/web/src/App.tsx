import { lazy, Suspense } from 'react';
import { useTranslation } from 'react-i18next';
import { createBrowserRouter, Navigate, Outlet, RouterProvider, useLocation } from 'react-router';
import { useGetHealthQuery, useGetMeQuery } from './api/generated';
import { FormError, Skeleton } from './components/Field';
import { Button } from './components/ui/button';
import { errorKey, useSignOut } from './lib/session';

const Login = lazy(() => import('./screens/Login'));
const Register = lazy(() => import('./screens/Register'));
const AcceptInvite = lazy(() => import('./screens/AcceptInvite'));
const Workspaces = lazy(() => import('./screens/Workspaces'));
const Home = lazy(() => import('./screens/Home'));
const Groups = lazy(() => import('./screens/Groups'));
const GroupForm = lazy(() => import('./screens/GroupForm'));
const Timetable = lazy(() => import('./screens/Timetable'));
const Students = lazy(() => import('./screens/Students'));
const StudentForm = lazy(() => import('./screens/StudentForm'));
const StudentLogin = lazy(() => import('./screens/StudentLogin'));
const StudentHome = lazy(() => import('./screens/StudentHome'));

function Layout() {
  const { t, i18n } = useTranslation();
  const health = useGetHealthQuery();
  const me = useGetMeQuery();
  const signOut = useSignOut();
  const other = i18n.language === 'ar' ? 'en' : 'ar';

  const apiStatus = health.isLoading
    ? t('shell.api.checking')
    : health.isSuccess
      ? t('shell.api.ok')
      : t('shell.api.down');

  return (
    <div className="min-h-dvh bg-muted/40 font-sans text-foreground">
      <header className="flex items-center justify-between gap-2 border-b bg-background px-4 py-3">
        <span className="text-xl font-bold">{t('app.name')}</span>
        <div className="flex gap-2">
          <Button
            variant="outline"
            size="sm"
            lang={other}
            onClick={() => void i18n.changeLanguage(other)}
          >
            {t('shell.switchLanguage')}
          </Button>
          {me.data && (
            <Button variant="ghost" size="sm" onClick={() => void signOut()}>
              {t('shell.logout')}
            </Button>
          )}
        </div>
      </header>
      <main className="mx-auto grid max-w-sm gap-4 px-4 py-8">
        <Suspense fallback={<Skeleton />}>
          <Outlet />
        </Suspense>
        <p role="status" className="text-center text-xs text-muted-foreground">
          {apiStatus}
        </p>
      </main>
    </div>
  );
}

function RequireAuth({ loginPath = '/login' }: { loginPath?: string }) {
  const { t } = useTranslation();
  const me = useGetMeQuery();
  const { pathname } = useLocation();

  if (me.isLoading) return <Skeleton />;
  if (me.error && 'status' in me.error && me.error.status === 401) {
    return <Navigate to={`${loginPath}?next=${encodeURIComponent(pathname)}`} replace />;
  }
  if (me.error) return <FormError message={t(errorKey(me.error))} />;
  return <Outlet />;
}

const router = createBrowserRouter([
  {
    element: <Layout />,
    children: [
      { path: '/login', element: <Login /> },
      { path: '/register', element: <Register /> },
      { path: '/invite/:token', element: <AcceptInvite /> },
      // Student app (Day 14 makes it the installable PWA).
      { path: '/s/login', element: <StudentLogin /> },
      { path: '/s/activate/:token', element: <StudentLogin /> },
      {
        element: <RequireAuth loginPath="/s/login" />,
        children: [{ path: '/s', element: <StudentHome /> }],
      },
      {
        element: <RequireAuth />,
        children: [
          { path: '/', element: <Home /> },
          { path: '/workspaces', element: <Workspaces /> },
          { path: '/groups', element: <Groups /> },
          { path: '/groups/new', element: <GroupForm /> },
          { path: '/groups/:id', element: <GroupForm /> },
          { path: '/timetable', element: <Timetable /> },
          { path: '/students', element: <Students /> },
          { path: '/students/new', element: <StudentForm /> },
          { path: '/students/:id', element: <StudentForm /> },
        ],
      },
      { path: '*', element: <Navigate to="/" replace /> },
    ],
  },
]);

export function App() {
  return <RouterProvider router={router} />;
}
