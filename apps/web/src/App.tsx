import { lazy, Suspense } from 'react';
import { useTranslation } from 'react-i18next';
import {
  createBrowserRouter,
  Navigate,
  Outlet,
  type RouteObject,
  RouterProvider,
  useLocation,
} from 'react-router';
import { useGetMeQuery } from './api/generated';
import { AppShell } from './components/AppShell';
import { FormError, Skeleton } from './components/Field';
import { ThemeToggle } from './components/ThemeToggle';
import { Button } from './components/ui/button';
import { errorKey, useSignOut } from './lib/session';

const Login = lazy(() => import('./screens/Login'));
const Register = lazy(() => import('./screens/Register'));
const ForgotPassword = lazy(() => import('./screens/ForgotPassword'));
const ResetPassword = lazy(() => import('./screens/ResetPassword'));
const AcceptInvite = lazy(() => import('./screens/AcceptInvite'));
const Workspaces = lazy(() => import('./screens/Workspaces'));
const Members = lazy(() => import('./screens/Members'));
const Home = lazy(() => import('./screens/Home'));
const Groups = lazy(() => import('./screens/Groups'));
const GroupForm = lazy(() => import('./screens/GroupForm'));
const Timetable = lazy(() => import('./screens/Timetable'));
const Students = lazy(() => import('./screens/Students'));
const StudentForm = lazy(() => import('./screens/StudentForm'));
const StudentLogin = lazy(() => import('./screens/StudentLogin'));
const StudentHome = lazy(() => import('./screens/StudentHome'));
const StudentScan = lazy(() => import('./screens/StudentScan'));
const SessionLive = lazy(() => import('./screens/SessionLive'));
const Receipt = lazy(() => import('./screens/Receipt'));
const FakePhone = lazy(() => import('./screens/FakePhone'));
const Messages = lazy(() => import('./screens/Messages'));
const More = lazy(() => import('./screens/More'));
const Fees = lazy(() => import('./screens/Fees'));

/** Signed-out screens and the student app: the wordmark, the notebook's red line, one column. */
function Layout() {
  const { t, i18n } = useTranslation();
  const me = useGetMeQuery();
  const signOut = useSignOut();
  const other = i18n.language === 'ar' ? 'en' : 'ar';
  const { pathname } = useLocation();
  const isStudentApp = pathname === '/s' || pathname.startsWith('/s/');

  return (
    <div className="min-h-dvh bg-background font-sans text-foreground">
      <header className="flex items-center justify-between gap-2 border-b-2 border-margin-red bg-card px-4 py-3 print:hidden">
        <span className="text-2xl font-bold tracking-tight text-ink">{t('app.name')}</span>
        <div className="flex items-center gap-2">
          <ThemeToggle />
          <Button
            variant="outline"
            size="sm"
            lang={other}
            onClick={() => void i18n.changeLanguage(other)}
          >
            {t('shell.switchLanguage')}
          </Button>
          {/* The student app keeps sign-out in its settings, away from the header (audit S3). */}
          {me.data && !isStudentApp && (
            <Button variant="ghost" size="sm" onClick={() => void signOut()}>
              {t('shell.logout')}
            </Button>
          )}
        </div>
      </header>
      <main className="mx-auto grid max-w-md gap-4 px-4 py-8">
        <Suspense fallback={<Skeleton />}>
          <Outlet />
        </Suspense>
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

/** The route table; tests mount it in a memory router. */
export const routes: RouteObject[] = [
  {
    element: <Layout />,
    children: [
      { path: '/login', element: <Login /> },
      { path: '/register', element: <Register /> },
      { path: '/forgot', element: <ForgotPassword /> },
      { path: '/reset/:token', element: <ResetPassword /> },
      { path: '/invite/:token', element: <AcceptInvite /> },
      // Student app (Day 14 makes it the installable PWA).
      { path: '/s/login', element: <StudentLogin /> },
      { path: '/s/activate/:token', element: <StudentLogin /> },
      {
        element: <RequireAuth loginPath="/s/login" />,
        children: [
          { path: '/s', element: <StudentHome /> },
          { path: '/s/scan', element: <StudentScan /> },
        ],
      },
      { path: '*', element: <Navigate to="/" replace /> },
    ],
  },
  {
    element: <RequireAuth />,
    children: [
      {
        element: <AppShell />,
        children: [
          { path: '/', element: <Home /> },
          { path: '/workspaces', element: <Workspaces /> },
          { path: '/members', element: <Members /> },
          { path: '/groups', element: <Groups /> },
          { path: '/groups/new', element: <GroupForm /> },
          { path: '/groups/:id', element: <GroupForm /> },
          { path: '/timetable', element: <Timetable /> },
          { path: '/sessions/:id/live', element: <SessionLive /> },
          { path: '/receipts/:id', element: <Receipt /> },
          { path: '/messages', element: <Messages /> },
          { path: '/dev/phone', element: <FakePhone /> },
          { path: '/students', element: <Students /> },
          { path: '/students/new', element: <StudentForm /> },
          { path: '/students/:id', element: <StudentForm /> },
          { path: '/more', element: <More /> },
          { path: '/fees', element: <Fees /> },
        ],
      },
    ],
  },
];

const router = createBrowserRouter(routes);

export function App() {
  return <RouterProvider router={router} />;
}
