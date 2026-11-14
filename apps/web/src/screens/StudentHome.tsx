import { useEffect, useState } from 'react';
import { ChevronDown, ScanLine } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { Link } from 'react-router';
import type { MyAttendanceRecord, MySession } from '@dafter/contracts';
import {
  useBindDeviceMutation,
  useGetMeQuery,
  useGetMyAttendanceQuery,
  useGetMyScheduleQuery,
} from '@/api/generated';
import { FormError, Skeleton } from '@/components/Field';
import { PageHeader, Panel } from '@/components/Page';
import { Button } from '@/components/ui/button';
import { deviceKey, publicKeySpki } from '@/lib/device-key';
import { itemName } from '@/lib/groups';
import { isInstalled } from '@/lib/pwa';
import { errorKey, useSignOut } from '@/lib/session';
import { dayLabel, displayTime, localDate } from '@/lib/time';
import { cn } from '@/lib/utils';

type BindState = 'binding' | 'bound' | 'otherPhone' | 'failed';
type Bind = ReturnType<typeof useBindDeviceMutation>[0];

// Shared by the two effect runs of StrictMode, so they send one request.
let binding: Promise<BindState> | null = null;

/**
 * Binds on every visit: the server treats the same key as a no-op, so a second student on the
 * phone, or a phone whose binding was reset, binds again without any local flag to go stale.
 */
async function bindOnce(bind: Bind): Promise<BindState> {
  const pair = await deviceKey();
  const label = navigator.userAgent.slice(0, 100);
  const res = await bind({ bindDeviceRequest: { publicKey: await publicKeySpki(pair), label } });
  if ('error' in res)
    return errorKey(res.error) === 'errors.DEVICE_ALREADY_BOUND' ? 'otherPhone' : 'failed';
  return 'bound';
}

/** Student home: binds this phone, then the next class, Scan, my schedule and my attendance. */
export default function StudentHome() {
  const { t } = useTranslation();
  const me = useGetMeQuery();
  const [bind] = useBindDeviceMutation();
  const [state, setState] = useState<BindState>('binding');

  useEffect(() => {
    let cancelled = false;
    binding ??= bindOnce(bind)
      .catch(() => 'failed' as const)
      .finally(() => (binding = null));
    void binding.then((s) => !cancelled && setState(s));
    // Ask the browser not to evict this app's storage (it holds the device key).
    if (isInstalled()) void navigator.storage?.persist?.();
    return () => {
      cancelled = true;
    };
  }, [bind]);

  if (me.isLoading) return <Skeleton />;
  return (
    <>
      <PageHeader title={t('studentApp.welcome', { name: me.data?.name ?? '' })} />
      <NextSession />
      {/* Only say something while binding or when it failed; a bound phone just scans. */}
      {state === 'binding' && (
        <p role="status" className="text-sm text-muted-foreground">
          {t('studentApp.binding')}
        </p>
      )}
      {state === 'bound' && (
        <Button asChild size="lg" className="h-20 rounded-3xl text-xl font-bold shadow-card">
          <Link to="/s/scan">
            <ScanLine aria-hidden className="size-7" />
            {t('scan.open')}
          </Link>
        </Button>
      )}
      {(state === 'otherPhone' || state === 'failed') && (
        <FormError message={t(`studentApp.bindErrors.${state}`)} />
      )}
      <Schedule />
      <History />
      <Settings />
    </>
  );
}

const centerName = (c: MySession['center'], lang: string) =>
  lang === 'en' && c.nameEn ? c.nameEn : c.nameAr;
const timeRange = (s: MySession, lang: string) =>
  `${displayTime(s.startsAt, s.timezone, lang)} – ${displayTime(s.endsAt, s.timezone, lang)}`;

/** The next class that has not ended, on top: where the student is going next. */
function NextSession() {
  const { t, i18n } = useTranslation();
  const lang = i18n.language;
  const { data } = useGetMyScheduleQuery();
  const now = new Date().toISOString();
  const next = data?.find((s) => s.status !== 'cancelled' && s.endsAt > now);
  if (!next) return null;
  return (
    <section
      aria-label={t('today.next')}
      className="grid gap-1 rounded-3xl bg-gradient-to-br from-ink to-violet dark:from-[#3a56c8] dark:to-[#5b47c4] p-5 text-white shadow-card"
    >
      <span className="text-sm opacity-80">{t('today.next')}</span>
      <h2 className="text-xl font-bold">{itemName(next.subject, lang)}</h2>
      <p>
        {`${dayLabel(localDate(next.startsAt, next.timezone), lang)} · `}
        <bdi>{timeRange(next, lang)}</bdi>
      </p>
      <p className="text-sm opacity-80">{`${next.teacherName} · ${centerName(next.center, lang)}`}</p>
    </section>
  );
}

/** Two weeks, grouped by day; today stands out and cancelled classes are struck through. */
function Schedule() {
  const { t, i18n } = useTranslation();
  const lang = i18n.language;
  const { data, isLoading } = useGetMyScheduleQuery();
  if (isLoading) return <Skeleton />;
  const days = new Map<string, MySession[]>();
  for (const s of data ?? []) {
    const day = localDate(s.startsAt, s.timezone);
    days.set(day, [...(days.get(day) ?? []), s]);
  }
  const today = data?.[0] ? localDate(new Date(), data[0].timezone) : '';
  return (
    <Panel className="grid gap-3 p-5">
      <h2 className="font-semibold">{t('studentApp.schedule')}</h2>
      {!data?.length ? (
        <p className="text-sm text-muted-foreground">{t('studentApp.noSessions')}</p>
      ) : (
        <ul className="grid gap-4" data-testid="my-schedule">
          {[...days].map(([day, sessions]) => (
            <li key={day} className="grid gap-2">
              <h3 className="flex items-center gap-2 text-sm font-semibold text-muted-foreground">
                {dayLabel(day, lang)}
                {day === today && (
                  <span className="rounded-full bg-ink px-2 py-0.5 text-xs text-primary-foreground">
                    {t('studentApp.today')}
                  </span>
                )}
              </h3>
              <ul className="grid gap-2">
                {sessions.map((s) => {
                  const cancelled = s.status === 'cancelled';
                  return (
                    <li
                      key={s.id}
                      className={cn(
                        'grid gap-0.5 rounded-xl border p-3 text-sm',
                        day === today && !cancelled && 'border-ink/40 bg-ink-soft',
                        cancelled && 'text-muted-foreground',
                      )}
                    >
                      <span className="flex items-center justify-between gap-2 font-medium">
                        <bdi className={cn(cancelled && 'line-through')}>{timeRange(s, lang)}</bdi>
                        {cancelled && (
                          <span className="rounded-full bg-rose-soft px-2 py-0.5 text-xs text-rose">
                            {t('timetable.status.cancelled')}
                          </span>
                        )}
                      </span>
                      <span className={cn(cancelled && 'line-through')}>
                        {[
                          itemName(s.subject, lang),
                          s.teacherName,
                          centerName(s.center, lang),
                        ].join(' · ')}
                      </span>
                    </li>
                  );
                })}
              </ul>
            </li>
          ))}
        </ul>
      )}
    </Panel>
  );
}

const PILL: Record<MyAttendanceRecord['status'], string> = {
  present: 'bg-present-soft text-present',
  late: 'bg-late-soft text-late',
  makeup: 'bg-teal-soft text-teal',
  excused: 'bg-muted text-muted-foreground',
  absent: 'bg-absent-soft text-rose',
};

/** Attended out of counted classes (excused ones don't count), then each class with a pill. */
function History() {
  const { t, i18n } = useTranslation();
  const { data, isLoading } = useGetMyAttendanceQuery();
  if (isLoading) return <Skeleton />;
  const counted = data?.filter((r) => r.status !== 'excused') ?? [];
  const attended = counted.filter((r) => r.status !== 'absent').length;
  return (
    <Panel className="grid gap-3 p-5">
      <h2 className="font-semibold">{t('studentApp.history')}</h2>
      {!data?.length ? (
        <p className="text-sm text-muted-foreground">{t('studentApp.noHistory')}</p>
      ) : (
        <>
          {counted.length > 0 && (
            <p className="text-2xl font-bold" data-testid="attendance-rate">
              {t('studentApp.rate', { attended, total: counted.length })}
            </p>
          )}
          <ul className="grid gap-2" data-testid="my-attendance">
            {data.map((r) => (
              <li key={r.sessionId} className="flex items-center justify-between gap-2 text-sm">
                <span>
                  {`${dayLabel(localDate(r.startsAt, r.timezone), i18n.language)} · ${itemName(r.subject, i18n.language)}`}
                </span>
                <span
                  className={cn('rounded-full px-2.5 py-0.5 text-xs font-medium', PILL[r.status])}
                >
                  {t(`live.status.${r.status}`)}
                </span>
              </li>
            ))}
          </ul>
        </>
      )}
    </Panel>
  );
}

/** Sign-out lives here, folded away and confirmed, so a stray tap can't log the student out. */
function Settings() {
  const { t } = useTranslation();
  const signOut = useSignOut('/s/login');
  const [confirming, setConfirming] = useState(false);
  return (
    <details className="group rounded-2xl border bg-card px-4 py-2 [&[open]]:pb-4">
      <summary className="flex min-h-10 cursor-pointer list-none items-center justify-between gap-2 font-medium">
        {t('studentApp.settings')}
        <ChevronDown
          aria-hidden
          className="size-4 text-muted-foreground transition-transform group-open:rotate-180"
        />
      </summary>
      <Button
        variant={confirming ? 'destructive' : 'outline'}
        className="mt-2 w-full"
        onClick={() => (confirming ? void signOut() : setConfirming(true))}
      >
        {t(confirming ? 'studentApp.confirmLogout' : 'shell.logout')}
      </Button>
    </details>
  );
}
