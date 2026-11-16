import {
  type Session,
  SESSION_OPEN_EARLY_MINUTES,
  type StatsDay,
  type Workspace,
} from '@dafter/contracts';
import {
  CalendarCheck,
  Check,
  Clock,
  MessageSquareText,
  Play,
  ScanLine,
  UserPlus,
  Users,
  UsersRound,
  Wallet,
  type LucideIcon,
} from 'lucide-react';
import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Link, Navigate } from 'react-router';
import { getWorkspaceId, setWorkspaceId } from '@/api/base';
import {
  useGetCurrentWorkspaceQuery,
  useGetSessionRosterQuery,
  useGetTodayStatsQuery,
  useListSessionsQuery,
  useListGroupsQuery,
  useListInvitesQuery,
  useListMembersQuery,
  useListStudentsQuery,
} from '@/api/generated';
import { FormError, Skeleton } from '@/components/Field';
import { Avatar, Panel } from '@/components/Page';
import { PaymentSheet } from '@/components/PaymentSheet';
import { Button } from '@/components/ui/button';
import { itemName } from '@/lib/groups';
import { errorKey } from '@/lib/session';
import { dayLabel, displayTime, intlLocale, localDate } from '@/lib/time';
import { cn } from '@/lib/utils';

const startable = (s: Session) => s.status === 'scheduled' || s.status === 'open';

/** Re-renders every half minute, so "starts in 5 minutes" stays true. */
function useNow(everyMs = 30_000) {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const timer = setInterval(() => setNow(Date.now()), everyMs);
    return () => clearInterval(timer);
  }, [everyMs]);
  return now;
}

/** Counts up to `to` once, over ~0.7 s; jumps straight there with reduced motion. */
function useCountUp(to: number) {
  const [value, setValue] = useState(0);
  useEffect(() => {
    if (matchMedia('(prefers-reduced-motion: reduce)').matches) return setValue(to);
    let frame = 0;
    const start = performance.now();
    const step = (t: number) => {
      const p = Math.min(1, (t - start) / 700);
      setValue(Math.round(to * (1 - (1 - p) ** 3)));
      if (p < 1) frame = requestAnimationFrame(step);
    };
    frame = requestAnimationFrame(step);
    return () => cancelAnimationFrame(frame);
  }, [to]);
  return value;
}

/** "in 25 minutes" / "خلال 25 دقيقة", or hours once it is more than 90 minutes away. */
function relative(at: string, now: number, lang: string) {
  const minutes = Math.round((Date.parse(at) - now) / 60_000);
  const rtf = new Intl.RelativeTimeFormat(intlLocale(lang), { numeric: 'auto' });
  return Math.abs(minutes) > 90
    ? rtf.format(Math.round(minutes / 60), 'hour')
    : rtf.format(minutes, 'minute');
}

/** Today: the next session, the day's numbers, the week's attendance, the day's sessions. */
export default function Home() {
  const { t, i18n } = useTranslation();
  const hasWorkspace = !!getWorkspaceId();
  const current = useGetCurrentWorkspaceQuery(undefined, { skip: !hasWorkspace });
  const tz = current.data?.timezone ?? 'Africa/Cairo';
  const today = localDate(new Date(), tz);
  const sessions = useListSessionsQuery({ from: today, to: today }, { skip: !current.data });
  const stats = useGetTodayStatsQuery(undefined, { skip: !current.data });
  const setup = useSetupSteps(current.data);

  const code = (current.error as { data?: { code?: string } } | undefined)?.data?.code;
  if (code === 'WORKSPACE_NOT_FOUND') setWorkspaceId(null); // removed, or another user's choice
  if (!hasWorkspace || code === 'WORKSPACE_NOT_FOUND') return <Navigate to="/workspaces" replace />;
  if (current.isLoading || sessions.isLoading || setup === undefined) return <Skeleton />;

  const list = sessions.data ?? [];
  const next = list.find(startable);
  const error = current.error ?? sessions.error ?? stats.error;

  return (
    <div className="grid gap-6">
      <header>
        <h1 className="text-2xl font-bold">{dayLabel(today, i18n.language)}</h1>
        {/* Cancelled sessions are left out, like the sessions tile (audit 3 H1). */}
        <p className="text-muted-foreground">
          {t('today.count', { count: list.filter((s) => s.status !== 'cancelled').length })}
        </p>
      </header>
      <FormError message={error && t(errorKey(error))} />

      {/* Phones get one column in a different order: the next session, the shortcuts, then the
        numbers (audit T1). The two column wrappers dissolve until xl, so `order` can do it. */}
      <div className="grid gap-6 xl:grid-cols-[minmax(0,1fr)_20rem]">
        <div className="contents xl:grid xl:content-start xl:gap-6">
          {next ? (
            <NextSession session={next} tz={tz} />
          ) : setup.length ? (
            // A new workspace: what to do first, instead of an empty day and zeros (audit 3 H7).
            <SetupChecklist steps={setup} />
          ) : (
            <Panel className="grid justify-items-center gap-3 p-8 text-center">
              <span className="grid size-14 place-items-center rounded-full bg-ink-soft text-ink">
                <CalendarCheck className="size-7" aria-hidden />
              </span>
              <p className="font-semibold">{t(list.length ? 'today.allDone' : 'today.none')}</p>
              <Button asChild variant="outline">
                <Link to="/timetable">{t('today.openTimetable')}</Link>
              </Button>
            </Panel>
          )}

          {stats.data && !setup.length && (
            // One strip, not four big tiles (audit 3 H2).
            <ul className="order-3 grid grid-cols-4 rounded-2xl border bg-card shadow-card xl:order-none [&>li+li]:border-s">
              <Tile
                icon={CalendarCheck}
                tone="ink"
                value={stats.data.sessionsToday}
                label={t('stats.sessions')}
              />
              <Tile
                icon={UsersRound}
                tone="violet"
                value={stats.data.expectedToday}
                label={t('stats.expected')}
              />
              <Tile
                icon={ScanLine}
                tone="teal"
                value={stats.data.checkedInToday}
                label={t('stats.checkedIn')}
              />
              <Tile
                icon={Users}
                tone="amber"
                value={stats.data.activeStudents}
                label={t('stats.students')}
              />
            </ul>
          )}

          {list.length > 0 && (
            <div className="order-4 xl:order-none">
              <DayList sessions={list} next={next} tz={tz} />
            </div>
          )}
        </div>

        <div className="contents xl:grid xl:content-start xl:gap-6">
          {stats.data && !setup.length && (
            <div className="order-5 xl:order-none">
              <WeekChart week={stats.data.week} />
            </div>
          )}
          <div className="order-2 xl:order-none">
            <QuickActions role={current.data?.role} />
          </div>
        </div>
      </div>
    </div>
  );
}

type SetupStep = { key: 'group' | 'student' | 'assistant'; to: string; done: boolean };

/**
 * The owner's first steps in a new workspace: a group, a student, and (a center) an assistant.
 * [] once they are all done, or for other roles; undefined while loading.
 */
function useSetupSteps(ws?: Workspace): SetupStep[] | undefined {
  const owner = ws?.role === 'owner';
  const center = owner && ws.type === 'center';
  const groups = useListGroupsQuery(undefined, { skip: !owner });
  const students = useListStudentsQuery({}, { skip: !owner });
  const members = useListMembersQuery(undefined, { skip: !center });
  const invites = useListInvitesQuery(undefined, { skip: !center });
  if (!owner) return [];
  if (groups.isLoading || students.isLoading || members.isLoading || invites.isLoading)
    return undefined;
  const steps: SetupStep[] = [
    { key: 'group', to: '/groups/new', done: !!groups.data?.length },
    { key: 'student', to: '/students/new', done: !!students.data?.length },
  ];
  if (center)
    steps.push({
      key: 'assistant',
      to: '/members',
      done: (members.data?.length ?? 0) > 1 || !!invites.data?.length,
    });
  return steps.every((s) => s.done) ? [] : steps;
}

function SetupChecklist({ steps }: { steps: SetupStep[] }) {
  const { t } = useTranslation();
  const first = steps.find((s) => !s.done);
  return (
    <Panel className="grid gap-4 p-5">
      <div className="grid gap-1">
        <h2 className="text-lg font-semibold">{t('today.setup.title')}</h2>
        <p className="text-sm text-muted-foreground">
          {t('today.setup.progress', {
            done: steps.filter((s) => s.done).length,
            total: steps.length,
          })}
        </p>
      </div>
      <ol className="grid gap-2">
        {steps.map((s, i) => (
          <li key={s.key}>
            <Link
              to={s.to}
              aria-label={t(`today.setup.${s.key}`)}
              className={cn(
                'flex items-center gap-3 rounded-xl border p-3 transition-colors hover:bg-ink-soft/50 focus-visible:outline-2',
                s === first && 'border-ink bg-ink-soft/60',
                s.done && 'opacity-60',
              )}
            >
              <span
                className={cn(
                  'grid size-8 shrink-0 place-items-center rounded-full text-sm font-bold',
                  s.done ? 'bg-present text-white' : 'bg-card text-ink ring-1 ring-ink/30',
                )}
              >
                {s.done ? <Check className="size-4" aria-hidden /> : <bdi>{i + 1}</bdi>}
              </span>
              <span className="grid min-w-0 flex-1">
                <span className={cn('font-semibold', s.done && 'line-through')}>
                  {t(`today.setup.${s.key}`)}
                </span>
                <span className="text-sm text-muted-foreground">
                  {t(`today.setup.${s.key}Hint`)}
                </span>
              </span>
              {s.done && <span className="sr-only">{t('today.setup.done')}</span>}
            </Link>
          </li>
        ))}
      </ol>
    </Panel>
  );
}

const FAR_MS = 2 * 60 * 60_000;

const range = (s: Session, tz: string, lang: string) =>
  `${displayTime(s.startsAt, tz, lang)} – ${displayTime(s.endsAt, tz, lang)}`;

/** The one thing to do next: the session, when it starts, who is expected, and Start. */
function NextSession({ session: s, tz }: { session: Session; tz: string }) {
  const { t, i18n } = useTranslation();
  const lang = i18n.language;
  const now = useNow();
  const enrolled = useGetSessionRosterQuery({ id: s.id }).data?.length;
  const open = s.status === 'open';
  // Opens SESSION_OPEN_EARLY_MINUTES before the start; until then, no big Start (audit 3 H4).
  const opensAt = Date.parse(s.startsAt) - SESSION_OPEN_EARLY_MINUTES * 60_000;
  const waiting = !open && now < opensAt;
  // An open session needs no countdown (it may have been opened early); otherwise say when.
  const timing = open
    ? undefined
    : t(Date.parse(s.startsAt) > now ? 'today.startsIn' : 'today.started', {
        when: relative(s.startsAt, now, lang),
      });

  // More than 2 h away it is a reminder, not the thing to do now: one line (audit 3 V2).
  if (!open && Date.parse(s.startsAt) - now > FAR_MS)
    return (
      <section
        aria-labelledby="next-session"
        className="flex flex-wrap items-center gap-x-3 gap-y-1 rounded-2xl bg-linear-to-br from-[#3a4024] via-[#5d6838] to-[#785f50] px-4 py-3 text-sm text-white shadow-card"
      >
        <span className="rounded-full bg-white/15 px-2.5 py-0.5 text-xs font-medium">
          {t('today.next')}
        </span>
        <h2 id="next-session" className="text-base font-semibold">
          {itemName(s.subject, lang)}
        </h2>
        <bdi className="text-white/85">{range(s, tz, lang)}</bdi>
        <span className="ms-auto text-white/75">{timing}</span>
      </section>
    );

  return (
    <section
      aria-labelledby="next-session"
      className={cn(
        'relative grid overflow-hidden rounded-3xl bg-linear-to-br from-[#3a4024] via-[#5d6838] to-[#785f50] text-white shadow-card',
        waiting ? 'gap-3 p-5' : 'gap-5 p-6 sm:p-7',
      )}
    >
      <div
        aria-hidden
        className="pointer-events-none absolute -end-16 -top-16 size-56 rounded-full bg-white/10 blur-2xl"
      />
      <div className="relative flex flex-wrap items-center justify-between gap-2 text-sm">
        <span className="flex items-center gap-2 rounded-full bg-white/15 px-3 py-1 font-medium backdrop-blur">
          {open && <span className="size-2 animate-live rounded-full bg-white" />}
          {open ? t('today.inProgress') : t('today.next')}
        </span>
        {timing && <span className="text-white/85">{timing}</span>}
      </div>
      <div className="relative grid gap-1">
        <h2 id="next-session" className={cn('font-bold', waiting ? 'text-2xl' : 'text-3xl')}>
          {itemName(s.subject, lang)}
        </h2>
        <p className="text-lg text-white/90">{itemName(s.gradeLevel, lang)}</p>
        <p className="mt-1 flex flex-wrap gap-x-4 gap-y-1 text-white/85">
          <bdi>{range(s, tz, lang)}</bdi>
          <span>{s.teacherName}</span>
          {enrolled !== undefined && <span>{t('today.enrolled', { count: enrolled })}</span>}
        </p>
      </div>
      {waiting ? (
        <p className="relative flex items-center gap-2 justify-self-start rounded-full bg-white/15 px-4 py-2 font-medium">
          <Clock className="size-4" aria-hidden />
          {t('today.opensAt', { time: `⁨${displayTime(new Date(opensAt), tz, lang)}⁩` })}
        </p>
      ) : (
        <Button
          asChild
          size="lg"
          className="relative h-13 justify-self-start bg-white px-8 text-base font-semibold text-[#3a4024] shadow-lg transition-transform hover:scale-[1.02] hover:bg-white active:scale-[0.98]"
        >
          <Link to={`/sessions/${s.id}/live`} state={{ from: '/' }}>
            <Play aria-hidden className="fill-current" />
            {t(open ? 'today.continue' : 'today.startQr')}
          </Link>
        </Button>
      )}
    </section>
  );
}

const TILE_TONES = {
  ink: 'bg-ink-soft text-ink',
  violet: 'bg-violet-soft text-violet',
  teal: 'bg-teal-soft text-teal',
  amber: 'bg-amber-soft text-amber',
};

function Tile({
  icon: Icon,
  tone,
  value,
  label,
}: {
  icon: LucideIcon;
  tone: keyof typeof TILE_TONES;
  value: number;
  label: string;
}) {
  const shown = useCountUp(value);
  return (
    <li className="grid content-start justify-items-center gap-0.5 px-1 py-3 text-center">
      <span className={cn('hidden size-8 place-items-center rounded-lg lg:grid', TILE_TONES[tone])}>
        <Icon className="size-4" aria-hidden />
      </span>
      <bdi className="text-xl font-bold tabular-nums">{shown}</bdi>
      <span className="text-xs leading-tight text-muted-foreground">{label}</span>
    </li>
  );
}

/** Seven bars, oldest first: the share of records that were present, late or make-up. */
function WeekChart({ week }: { week: StatsDay[] }) {
  const { t, i18n } = useTranslation();
  const [grown, setGrown] = useState(false);
  // Bars start flat and grow on the next frame, so the height transition plays once.
  useEffect(() => {
    const frame = requestAnimationFrame(() => setGrown(true));
    return () => cancelAnimationFrame(frame);
  }, []);
  const day = (date: string) =>
    new Intl.DateTimeFormat(intlLocale(i18n.language), {
      weekday: 'short',
      timeZone: 'UTC',
    }).format(Date.parse(date));
  const totals = week.reduce((a, d) => ({ p: a.p + d.present, n: a.n + d.total }), { p: 0, n: 0 });
  const rate = totals.n ? Math.round((totals.p / totals.n) * 100) : undefined;

  return (
    <Panel className="grid gap-4 p-5">
      <div className="flex items-baseline justify-between gap-2">
        <h2 className="font-semibold">{t('stats.week')}</h2>
        {rate !== undefined && <bdi className="text-2xl font-bold text-present">{`${rate}%`}</bdi>}
      </div>
      <ol className="flex items-end gap-2" aria-label={t('stats.week')}>
        {week.map((d, i) => {
          const pct = Math.round((d.present / d.total) * 100);
          // A day without classes is «—», not a 0% bar (audit 3 H6).
          const shown = d.total ? `${pct}%` : t('stats.noClasses');
          return (
            <li key={d.date} className="flex flex-1 flex-col items-center gap-1.5">
              {/* A fixed-height track, so the bar's percentage height has something to resolve against. */}
              <div className="flex h-28 w-full items-end justify-center" title={shown}>
                {d.total ? (
                  <div
                    className={cn(
                      'w-full rounded-t-lg transition-[height] duration-700 ease-out',
                      i === week.length - 1 ? 'bg-ink' : 'bg-ink/30',
                    )}
                    style={{
                      height: grown ? `${Math.max(pct, 4)}%` : '0%',
                      transitionDelay: `${i * 60}ms`,
                    }}
                  />
                ) : (
                  // The day's sr-only line below already says «لا حصص».
                  <span
                    aria-hidden
                    className="text-sm text-muted-foreground before:content-['—']"
                  />
                )}
              </div>
              <span className="text-xs text-muted-foreground">{day(d.date)}</span>
              <span className="sr-only">{shown}</span>
            </li>
          );
        })}
      </ol>
    </Panel>
  );
}

/** The day's sessions in time order, with the teacher's initials. */
function DayList({ sessions, next, tz }: { sessions: Session[]; next?: Session; tz: string }) {
  const { t, i18n } = useTranslation();
  const lang = i18n.language;
  return (
    <Panel className="overflow-hidden">
      <h2 className="border-b px-5 py-4 font-semibold">{t('today.allSessions')}</h2>
      <ol className="divide-y">
        {sessions.map((s, i) => {
          const done = !startable(s);
          return (
            <li
              key={s.id}
              className={cn('flex animate-rise items-center gap-4 px-5 py-3', done && 'opacity-60')}
              style={{ animationDelay: `${i * 50}ms` }}
            >
              <div className="grid w-16 shrink-0 text-sm">
                <bdi className="font-semibold">{displayTime(s.startsAt, tz, lang)}</bdi>
                <bdi className="text-xs text-muted-foreground">
                  {displayTime(s.endsAt, tz, lang)}
                </bdi>
              </div>
              <span
                aria-hidden
                className={cn(
                  'h-10 w-1 shrink-0 rounded-full',
                  s === next ? 'bg-ink' : done ? 'bg-muted' : 'bg-violet/40',
                )}
              />
              <Avatar name={s.teacherName} className="hidden sm:grid" />
              <div className="grid min-w-0 flex-1">
                <span className="truncate font-semibold">{itemName(s.subject, lang)}</span>
                <span className="truncate text-sm text-muted-foreground">
                  {`${s.groupLabel ?? itemName(s.gradeLevel, lang)} · ${s.teacherName}`}
                </span>
              </div>
              {s === next ? (
                <span className="shrink-0 rounded-full bg-ink-soft px-3 py-1 text-xs font-semibold text-ink">
                  {t(s.status === 'open' ? 'today.inProgress' : 'today.next')}
                </span>
              ) : s.status === 'open' ? (
                <Button asChild size="sm">
                  <Link to={`/sessions/${s.id}/live`} state={{ from: '/' }}>
                    {t('today.continue')}
                  </Link>
                </Button>
              ) : startable(s) ? (
                // Later classes get no button of their own: one «ابدأ» per screen (audit 3 H5).
                <span className="sr-only">{t('timetable.status.scheduled')}</span>
              ) : (
                <span
                  className={cn(
                    'shrink-0 rounded-full px-3 py-1 text-xs',
                    s.status === 'cancelled' ? 'bg-rose-soft text-rose' : 'bg-muted',
                  )}
                >
                  {t(`timetable.status.${s.status}`)}
                </span>
              )}
            </li>
          );
        })}
      </ol>
    </Panel>
  );
}

const ACTION_TONES = [
  'bg-ink-soft text-ink',
  'bg-violet-soft text-violet',
  'bg-teal-soft text-teal',
  'bg-amber-soft text-amber',
];

/** The daily jobs at the door, one tap each. */
function QuickActions({ role }: { role?: string }) {
  const { t } = useTranslation();
  const [paying, setPaying] = useState(false);
  const items: { to?: string; label: string; icon: typeof Wallet }[] = [
    { to: '/students/new', label: t('today.addStudent'), icon: UserPlus },
    { label: t('today.recordPayment'), icon: Wallet },
    ...(role && role !== 'teacher'
      ? [{ to: '/messages', label: t('nav.messages'), icon: MessageSquareText }]
      : []),
  ];
  return (
    // One row of small shortcuts, sized to how many the role gets (audit 3 H3). Finding a
    // student is the header's search icon on phones and the top bar on laptops (audit 3 N5).
    <Panel className="p-2">
      <h2 className="sr-only">{t('today.quick')}</h2>
      <ul className={cn('grid gap-1', items.length === 2 ? 'grid-cols-2' : 'grid-cols-3')}>
        {items.map(({ to, label, icon: Icon }, i) => {
          const body = (
            <>
              <span
                className={cn(
                  'grid size-10 place-items-center rounded-xl transition-transform group-hover:scale-110',
                  ACTION_TONES[i % ACTION_TONES.length],
                )}
              >
                <Icon className="size-5" aria-hidden />
              </span>
              {label}
            </>
          );
          const cls =
            'group grid h-full w-full content-start justify-items-center gap-1.5 rounded-xl p-2 text-center text-xs leading-tight font-medium transition-colors hover:bg-ink-soft/50 focus-visible:outline-2';
          return (
            <li key={label}>
              {to ? (
                <Link to={to} className={cls}>
                  {body}
                </Link>
              ) : (
                <button type="button" className={cls} onClick={() => setPaying(true)}>
                  {body}
                </button>
              )}
            </li>
          );
        })}
      </ul>
      <PaymentSheet open={paying} onClose={() => setPaying(false)} />
    </Panel>
  );
}
