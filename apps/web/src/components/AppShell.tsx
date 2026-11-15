import {
  CalendarCheck,
  CalendarDays,
  ChartColumn,
  ChevronsUpDown,
  Ellipsis,
  Layers,
  LogOut,
  type LucideIcon,
  MessageSquareText,
  Search,
  Smartphone,
  UserCog,
  Users,
  Wallet,
  HandCoins,
} from 'lucide-react';
import { Suspense } from 'react';
import { useTranslation } from 'react-i18next';
import { Link, NavLink, Outlet, useLocation, useNavigate } from 'react-router';
import { getWorkspaceId } from '@/api/base';
import { useGetCurrentWorkspaceQuery, useGetMeQuery } from '@/api/generated';
import { Breadcrumbs } from '@/components/Breadcrumbs';
import { Skeleton } from '@/components/Field';
import { ThemeToggle } from '@/components/ThemeToggle';
import { Button } from '@/components/ui/button';
import { useSignOut, workspaceName } from '@/lib/session';
import { cn } from '@/lib/utils';

type Item = { to: string; label: string; icon: LucideIcon; end?: boolean };

/** The staff navigation for the current role; the phone tabs keep the first four plus "More". */
export function useNavItems() {
  const { t } = useTranslation();
  const role = useGetCurrentWorkspaceQuery(undefined, { skip: !getWorkspaceId() }).data?.role;
  const main: Item[] = [
    { to: '/', label: t('nav.today'), icon: CalendarCheck, end: true },
    { to: '/timetable', label: t('nav.timetable'), icon: CalendarDays },
    { to: '/students', label: t('nav.students'), icon: Users },
    { to: '/groups', label: t('nav.groups'), icon: Layers },
  ];
  const more: Item[] = [
    { to: '/dashboard', label: t('nav.dashboard'), icon: ChartColumn },
    ...(role && role !== 'teacher'
      ? [
          { to: '/fees', label: t('nav.fees'), icon: Wallet },
          { to: '/messages', label: t('nav.messages'), icon: MessageSquareText },
        ]
      : []),
    { to: '/cash-summary', label: t('nav.cashSummary'), icon: HandCoins },
    { to: '/members', label: t('nav.staff'), icon: UserCog },
    // shortcut: dev builds only; the demo deploy opens /dev/phone directly (docs/demo-script.md).
    ...(import.meta.env.DEV ? [{ to: '/dev/phone', label: t('nav.phone'), icon: Smartphone }] : []),
  ];
  return { main, more };
}

/** Language switch and sign-out, shared by the sidebar and the "More" screen. */
export function AccountActions({ className, dark }: { className?: string; dark?: boolean }) {
  const { t, i18n } = useTranslation();
  const signOut = useSignOut();
  const other = i18n.language === 'ar' ? 'en' : 'ar';
  return (
    <div className={cn('grid gap-2', className)}>
      <Button
        variant="outline"
        lang={other}
        className={cn(dark && 'border-white/15 bg-white/5 text-white hover:bg-white/10')}
        onClick={() => void i18n.changeLanguage(other)}
      >
        {t('shell.switchLanguage')}
      </Button>
      <ThemeToggle
        withLabel
        className={cn(dark && 'border-white/15 bg-white/5 text-white hover:bg-white/10')}
      />
      <Button
        variant="ghost"
        className={cn(dark && 'text-white/70 hover:bg-white/10 hover:text-white')}
        onClick={() => void signOut()}
      >
        <LogOut aria-hidden className="rtl:-scale-x-100" />
        {t('shell.logout')}
      </Button>
    </div>
  );
}

function Wordmark({ dark }: { dark?: boolean }) {
  const { t } = useTranslation();
  return (
    <Link
      to="/"
      className={cn(
        'flex items-center gap-2 text-2xl font-bold tracking-tight',
        dark ? 'text-white' : 'text-ink',
      )}
    >
      <img src="/icons/icon.svg" alt="" className="size-9 rounded-lg" />
      {t('app.name')}
    </Link>
  );
}

/** The workspace name; tapping it switches workspace. */
function WorkspaceChip({ className, dark }: { className?: string; dark?: boolean }) {
  const { t, i18n } = useTranslation();
  const ws = useGetCurrentWorkspaceQuery(undefined, { skip: !getWorkspaceId() }).data;
  if (!ws) return null;
  return (
    <Link
      to="/workspaces"
      aria-label={t('nav.switchWorkspace')}
      className={cn(
        'flex min-w-0 items-center gap-2 rounded-xl px-3 py-2 text-sm transition-colors focus-visible:outline-2',
        dark ? 'bg-white/8 text-white hover:bg-white/12' : 'border bg-card hover:bg-ink-soft',
        className,
      )}
    >
      <span className="min-w-0 flex-1">
        <span className="block truncate font-semibold">{workspaceName(ws, i18n.language)}</span>
        <span className={cn('block text-xs', dark ? 'text-white/60' : 'text-muted-foreground')}>
          {t(`roles.${ws.role}`)}
        </span>
      </span>
      <ChevronsUpDown className="size-4 shrink-0 opacity-60" aria-hidden />
    </Link>
  );
}

/** Laptop top bar: a greeting by time of day, and a student search that opens the students list. */
function TopBar() {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const name = useGetMeQuery().data?.name.split(' ')[0];
  const hour = Number(
    new Intl.DateTimeFormat('en-GB', {
      hour: '2-digit',
      hourCycle: 'h23',
      timeZone: 'Africa/Cairo',
    }).format(new Date()),
  );
  return (
    <div className="hidden items-center justify-between gap-6 px-8 pt-6 lg:flex print:hidden">
      <p className="text-lg font-semibold">
        {t(hour < 12 ? 'shell.morning' : 'shell.evening', { name: name ?? '' })}
      </p>
      <form
        role="search"
        className="relative w-80"
        onSubmit={(e) => {
          e.preventDefault();
          const q = new FormData(e.currentTarget).get('q')?.toString().trim();
          void navigate(q ? `/students?q=${encodeURIComponent(q)}` : '/students');
        }}
      >
        <Search
          className="pointer-events-none absolute start-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground"
          aria-hidden
        />
        <input
          name="q"
          type="search"
          aria-label={t('students.search')}
          placeholder={t('students.search')}
          className="h-10 w-full rounded-xl border bg-card ps-9 pe-3 text-sm shadow-card outline-none focus-visible:ring-2 focus-visible:ring-ring"
        />
      </form>
    </div>
  );
}

const sideLink = ({ isActive }: { isActive: boolean }) =>
  cn(
    'flex items-center gap-3 rounded-xl px-3 py-2.5 text-sm font-medium text-white/70 transition-colors hover:bg-white/8 hover:text-white',
    isActive && 'bg-ink text-primary-foreground shadow-lg shadow-ink/30 hover:bg-ink',
  );

const tabLink = ({ isActive }: { isActive: boolean }) =>
  cn(
    'group flex min-h-16 flex-1 flex-col items-center justify-center gap-1 text-xs text-muted-foreground transition-colors',
    isActive && 'font-semibold text-ink',
  );

/** The icon sits in a pill that fills in when its tab is active. */
function TabIcon({ icon: Icon }: { icon: LucideIcon }) {
  return (
    <span className="grid h-8 w-14 place-items-center rounded-full transition-all duration-300 group-aria-[current=page]:bg-ink-soft">
      <Icon className="size-5" aria-hidden />
    </span>
  );
}

/** Staff screens: a navy sidebar on laptops, bottom tabs on phones. */
export function AppShell() {
  const { t } = useTranslation();
  const { main, more } = useNavItems();
  const { pathname } = useLocation();
  const hasWorkspace = !!getWorkspaceId();

  return (
    <div className="min-h-dvh bg-background font-sans text-foreground lg:flex">
      {hasWorkspace && (
        <aside className="hidden w-68 shrink-0 flex-col gap-6 bg-navy px-4 py-6 lg:sticky lg:top-0 lg:flex lg:h-dvh print:hidden">
          <Wordmark dark />
          <WorkspaceChip dark />
          <nav aria-label={t('nav.label')} className="grid gap-1">
            {[...main, ...more].map(({ to, label, icon: Icon, end }) => (
              <NavLink key={to} to={to} end={end} className={sideLink}>
                <Icon className="size-5" aria-hidden />
                {label}
              </NavLink>
            ))}
          </nav>
          <AccountActions dark className="mt-auto" />
        </aside>
      )}

      <div className="flex min-w-0 flex-1 flex-col">
        <header className="sticky top-0 z-10 flex items-center justify-between gap-3 border-b bg-card/90 px-4 py-2 backdrop-blur lg:hidden print:hidden">
          <Wordmark />
          <WorkspaceChip className="max-w-[60%]" />
        </header>
        {hasWorkspace && <TopBar />}
        <main
          // A new key per route replays the entrance, once per page.
          key={pathname}
          className={cn(
            'mx-auto grid w-full max-w-6xl animate-rise content-start gap-4 px-4 py-6 lg:px-8',
            hasWorkspace && 'pb-28 lg:pb-8',
          )}
        >
          <Breadcrumbs />
          <Suspense fallback={<Skeleton />}>
            <Outlet />
          </Suspense>
        </main>
      </div>

      {hasWorkspace && (
        <nav
          aria-label={t('nav.label')}
          className="fixed inset-x-0 bottom-0 z-10 flex border-t bg-card/95 pb-[env(safe-area-inset-bottom)] backdrop-blur lg:hidden print:hidden"
        >
          {main.map(({ to, label, icon, end }) => (
            <NavLink key={to} to={to} end={end} className={tabLink}>
              <TabIcon icon={icon} />
              {label}
            </NavLink>
          ))}
          <NavLink to="/more" className={tabLink}>
            <TabIcon icon={Ellipsis} />
            {t('nav.more')}
          </NavLink>
        </nav>
      )}
    </div>
  );
}
