import type {
  AttendanceRecord,
  CloseSessionResult,
  OpenSession,
  RosterEntry,
} from '@dafter/contracts';
import { ChevronDown, Clock, List, Maximize, X } from 'lucide-react';
import QRCode from 'qrcode';
import { type ReactNode, useCallback, useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { useTranslation } from 'react-i18next';
import { useWakeLock } from '@/lib/wake-lock';
import { useDispatch } from 'react-redux';
import { Link, useLocation, useParams } from 'react-router';
import {
  useCloseSessionMutation,
  useGetCurrentWorkspaceQuery,
  useGetSessionRosterQuery,
  useListSessionsQuery,
  useMarkAttendanceMutation,
  useOpenSessionMutation,
} from '@/api/generated';
import { streamEvents } from '@/api/sse';
import { FormError, Skeleton } from '@/components/Field';
import { Avatar } from '@/components/Page';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { ScrollArea } from '@/components/ui/scroll-area';
import { itemName } from '@/lib/groups';
import { importQrKey, qrText } from '@/lib/qr';
import { errorDetails, errorKey } from '@/lib/session';
import { displayTime, localDate } from '@/lib/time';
import { cn } from '@/lib/utils';
import type { AppDispatch } from '@/store';

type Records = Map<string, AttendanceRecord>;

/** Where the teacher opened the session from (Today or the timetable), for the way back (audit 3 LV4). */
const useCameFrom = () =>
  (useLocation().state as { from?: string } | null)?.from === '/timetable' ? '/timetable' : '/';

/** Keeps the newest record per student (a snapshot row may arrive after a live one). */
const merge = (records: Records, r: AttendanceRecord) => {
  const old = records.get(r.studentId);
  if (old && old.recordedAt > r.recordedAt) return records;
  return new Map(records).set(r.studentId, r);
};

/** Teacher's full-screen session: rotating QR, the class list with one-tap marking, close. */
export default function SessionLive() {
  const { t, i18n } = useTranslation();
  const { id } = useParams();
  const [open, opened] = useOpenSessionMutation();
  const tz = useGetCurrentWorkspaceQuery().data?.timezone ?? 'Africa/Cairo';
  const roster = useGetSessionRosterQuery({ id: id! });
  const [records, setRecords] = useState<Records>(new Map());
  const [closed, setClosed] = useState<{ messagesQueued: number }>();
  const dispatch = useDispatch<AppDispatch>();
  const [session, setSession] = useState<{ open: OpenSession; offset: number }>();
  // Phones: the QR alone over the whole screen (no header or tab bar), for students to scan.
  const [full, setFull] = useState(false);
  const exitFull = useCallback(() => setFull(false), []);
  // The QR must stay on screen for the whole check-in, so the phone or laptop never dims.
  useWakeLock(!!session && !closed);

  useEffect(() => {
    const sent = Date.now();
    void open({ id: id! }).then((res) => {
      if (!res.data) return;
      // Server minus local time, assuming the reply took as long as the request.
      const offset = Date.parse(res.data.serverTime) - (sent + Date.now()) / 2;
      setSession({ open: res.data, offset });
    });
  }, [id, open]);

  useEffect(() => {
    if (!session || closed) return;
    const ctrl = new AbortController();
    void streamEvents<AttendanceRecord>(
      `/api/v1/sessions/${id}/live`,
      dispatch,
      (r) => setRecords((m) => merge(m, r)),
      ctrl.signal,
    );
    return () => ctrl.abort();
  }, [session, closed, id, dispatch]);

  // Everyone expected (by name), then make-ups who checked in without being enrolled.
  const name = (r: { nameAr: string; nameEn: string | null }) =>
    i18n.language === 'en' && r.nameEn ? r.nameEn : r.nameAr;

  if (opened.error) {
    // More than 30 minutes ahead: keep the title and the list, say when it opens (audit 3 LV1).
    const early = errorDetails(opened.error, 'SESSION_TOO_EARLY');
    if (!early) return <FormError message={t(errorKey(opened.error))} />;
    return (
      <div className="grid gap-4">
        <SessionTitle id={id!} />
        <Card>
          <CardContent className="grid justify-items-center gap-3 pt-6 text-center">
            <Clock className="size-8 text-ink" aria-hidden />
            <p role="status" className="text-lg font-semibold">
              {t('today.opensAt', {
                time: `⁨${displayTime(early.opensAt!, tz, i18n.language)}⁩`,
              })}
            </p>
            <p className="text-sm text-muted-foreground">{t('live.tooEarlyHint')}</p>
            <BackButton />
          </CardContent>
        </Card>
        {!!roster.data?.length && (
          <Card>
            <CardHeader>
              <CardTitle>
                <h2>{t('today.enrolled', { count: roster.data.length })}</h2>
              </CardTitle>
            </CardHeader>
            <CardContent>
              <ul className="grid divide-y text-sm">
                {roster.data.map((r) => (
                  <li key={r.studentId} className="flex items-center gap-3 py-2">
                    <Avatar name={name(r)} className="size-8 text-xs" />
                    {name(r)}
                  </li>
                ))}
              </ul>
            </CardContent>
          </Card>
        )}
      </div>
    );
  }
  if (!session) return <Skeleton />;
  const expected = roster.data ?? [];
  const extra = [...records.values()].filter(
    (r) => !expected.some((e) => e.studentId === r.studentId),
  );
  const rows: RosterEntry[] = [...expected, ...extra];
  const here = [...records.values()].filter((r) => r.status !== 'absent').length;

  return (
    <div className="grid gap-4 lg:grid-cols-2 lg:items-start">
      <div className="grid gap-4">
        <SessionTitle id={id!} />
        {closed ? (
          <ClosedSummary records={[...records.values()]} messagesQueued={closed.messagesQueued} />
        ) : (
          <>
            <div className="grid grid-cols-2 gap-2 lg:hidden">
              <Button variant="outline" onClick={() => setFull(true)}>
                <Maximize aria-hidden />
                {t('live.fullScreen')}
              </Button>
              <Button
                variant="outline"
                onClick={() =>
                  document.getElementById('class-list')?.scrollIntoView({ behavior: 'smooth' })
                }
              >
                <List aria-hidden />
                {t('live.toList')}
              </Button>
            </div>
            {full ? (
              <FullScreen onExit={exitFull}>
                <RotatingQr session={session.open} offset={session.offset} />
                <p className="text-center text-2xl font-bold" aria-live="polite">
                  {t('live.count', { count: here })}
                </p>
              </FullScreen>
            ) : (
              <RotatingQr session={session.open} offset={session.offset} />
            )}
          </>
        )}
      </div>
      <div className="grid gap-4">
        <div className="text-center" aria-live="polite">
          {/* "3 / 20" reads at a glance; the sentence stays for a class with no roster (audit 3 LV3). */}
          <p key={here} className="animate-in text-3xl font-bold zoom-in-90 duration-300">
            {expected.length > 0 ? (
              <bdi dir="ltr">{`${here} / ${expected.length}`}</bdi>
            ) : (
              t('live.count', { count: here })
            )}
          </p>
          {expected.length > 0 && (
            <p className="text-sm text-muted-foreground">{t('live.expected')}</p>
          )}
        </div>
        <Card id="class-list" className="scroll-mt-4">
          <CardHeader>
            <CardTitle>
              <h2>{t('live.list')}</h2>
            </CardTitle>
          </CardHeader>
          <CardContent>
            <FormError message={roster.error && t(errorKey(roster.error))} />
            <ul className="grid divide-y" data-testid="live-list">
              {rows.map((r) => (
                <RosterRow
                  key={r.studentId}
                  sessionId={id!}
                  name={name(r)}
                  studentId={r.studentId}
                  record={records.get(r.studentId)}
                  onMarked={(rec) => setRecords((m) => merge(m, rec))}
                />
              ))}
            </ul>
          </CardContent>
        </Card>
        {closed ? (
          <BackButton />
        ) : (
          <CloseButton
            id={id!}
            onClosed={(result) => {
              setRecords((m) => result.records.reduce(merge, m));
              setClosed({ messagesQueued: result.messagesQueued });
            }}
          />
        )}
      </div>
    </div>
  );
}

/** Subject, grade and time, from today's sessions (the live screen only opens today's). */
function SessionTitle({ id }: { id: string }) {
  const { i18n } = useTranslation();
  const tz = useGetCurrentWorkspaceQuery().data?.timezone ?? 'Africa/Cairo';
  const today = localDate(new Date(), tz);
  const s = useListSessionsQuery({ from: today, to: today }).data?.find((x) => x.id === id);
  if (!s) return null;
  return (
    <header className="text-center">
      <h1 className="text-xl font-bold">
        {`${itemName(s.subject, i18n.language)} · ${itemName(s.gradeLevel, i18n.language)}`}
        {s.groupLabel && ` · ${s.groupLabel}`}
      </h1>
      <p className="text-sm text-muted-foreground">
        {`${s.teacherName} · `}
        <bdi>{`${displayTime(s.startsAt, tz, i18n.language)} – ${displayTime(s.endsAt, tz, i18n.language)}`}</bdi>
      </p>
    </header>
  );
}

const FIXES = ['present', 'late', 'excused', 'absent'] as const;
// The status pill's colours (absent rows show the "present" button instead).
const PILL: Record<AttendanceRecord['status'], string> = {
  present: 'bg-present-soft text-present',
  late: 'bg-late-soft text-late',
  excused: 'bg-muted text-muted-foreground',
  makeup: 'bg-violet-soft text-violet',
  absent: 'bg-absent-soft',
};

/** One student: their status (tap to change it), or a one-tap "present" for students without a phone. */
function RosterRow({
  sessionId,
  studentId,
  name,
  record,
  onMarked,
}: {
  sessionId: string;
  studentId: string;
  name: string;
  record?: AttendanceRecord;
  onMarked: (r: AttendanceRecord) => void;
}) {
  const { t } = useTranslation();
  const [mark, marking] = useMarkAttendanceMutation();
  const [picking, setPicking] = useState(false);
  const markable = !record || record.status === 'absent';
  const set = async (status: (typeof FIXES)[number]) => {
    const res = await mark({ id: sessionId, studentId, markAttendanceRequest: { status } });
    if (res.data) {
      setPicking(false);
      onMarked(res.data);
    }
  };
  return (
    <li
      // A new record replays the green flash, so a fresh check-in catches the eye.
      key={record?.recordedAt}
      className={cn(
        'flex min-h-12 flex-wrap items-center justify-between gap-2 rounded-lg px-2 py-1 text-sm',
        record && record.status !== 'absent' && 'animate-flash',
      )}
    >
      <span className="flex items-center gap-3">
        <Avatar name={name} className="size-9 text-xs" />
        {name}
        {record?.status === 'absent' && (
          <span className="text-muted-foreground">{` · ${t('live.status.absent')}`}</span>
        )}
      </span>
      {markable ? (
        <Button
          size="sm"
          variant="outline"
          disabled={marking.isLoading}
          aria-label={t('live.markPresent', { name })}
          onClick={() => void set('present')}
        >
          {t('live.present')}
        </Button>
      ) : (
        // A wrong tap or scan is fixed here: tap the status, pick the right one. A coloured pill
        // with a chevron, so it reads as something to tap (audit 3 LV5).
        <button
          type="button"
          aria-expanded={picking}
          aria-label={t('live.change', { name })}
          onClick={() => setPicking((p) => !p)}
          className={cn(
            'inline-flex h-8 items-center gap-1 rounded-full ps-3 pe-2 text-xs font-medium transition-colors focus-visible:outline-2',
            PILL[record.status],
          )}
        >
          {t(`live.status.${record.status}`)}
          <ChevronDown aria-hidden className="size-3.5" />
        </button>
      )}
      {picking && record && (
        <div
          className="flex w-full flex-wrap gap-1"
          role="group"
          aria-label={t('live.change', { name })}
        >
          {FIXES.map((st) => (
            <Button
              key={st}
              size="sm"
              variant={st === record.status ? 'default' : 'outline'}
              disabled={marking.isLoading}
              onClick={() => void set(st)}
            >
              {t(`live.status.${st}`)}
            </Button>
          ))}
        </div>
      )}
      <FormError message={marking.error && t(errorKey(marking.error))} />
    </li>
  );
}

/** Draws a new QR whenever the 10-second window changes on the server's clock. */
function RotatingQr({ session, offset }: { session: OpenSession; offset: number }) {
  const { t } = useTranslation();
  // `left`: milliseconds until this code expires, for the countdown bar.
  const [qr, setQr] = useState<{ text: string; image: string; left: number }>();
  const last = useRef(-1);

  useEffect(() => {
    let alive = true;
    const keyPromise = importQrKey(session.qrKey);
    const tick = async () => {
      const serverNow = Date.now() + offset;
      const window = Math.floor(serverNow / session.windowMs);
      if (window === last.current) return;
      last.current = window;
      const text = await qrText(await keyPromise, session.sessionId, window);
      const image = await QRCode.toDataURL(text, { margin: 1, width: 640 });
      const left = (window + 1) * session.windowMs - serverNow;
      if (alive) setQr({ text, image, left });
    };
    void tick();
    const timer = setInterval(() => void tick(), 500);
    return () => {
      alive = false;
      clearInterval(timer);
      last.current = -1;
    };
  }, [session, offset]);

  if (!qr) return <Skeleton />;
  return (
    <div className="mx-auto grid w-full max-w-md gap-3 rounded-3xl border bg-card p-4 shadow-card">
      <img
        // A new key per code replays the fade, so each rotation is visible.
        key={qr.text}
        src={qr.image}
        alt={t('live.qrAlt')}
        data-testid="session-qr"
        data-code={qr.text}
        className="aspect-square w-full animate-in rounded-xl bg-white fade-in-50 duration-300"
      />
      <div className="h-1.5 overflow-hidden rounded-full bg-muted" aria-hidden>
        <div
          key={qr.text}
          className="h-full ltr:origin-left rtl:origin-right animate-countdown rounded-full bg-ink"
          style={{ animationDuration: `${qr.left}ms` }}
        />
      </div>
    </div>
  );
}

/** Back to Today or the timetable, wherever the teacher came from. */
function BackButton() {
  const { t } = useTranslation();
  const from = useCameFrom();
  return (
    <Button asChild variant="outline">
      <Link to={from}>{t(from === '/' ? 'live.backToday' : 'live.back')}</Link>
    </Button>
  );
}

const SUMMARY = ['present', 'late', 'excused', 'absent'] as const;

/** After the close: how many of each status, and how many parent messages are on their way. */
function ClosedSummary({
  records,
  messagesQueued,
}: {
  records: AttendanceRecord[];
  messagesQueued: number;
}) {
  const { t } = useTranslation();
  return (
    <section role="status" className="grid gap-3 rounded-3xl border bg-card p-4 shadow-card">
      <p className="text-center text-lg font-semibold">{t('live.closed')}</p>
      <dl className="grid grid-cols-4 gap-2 text-center">
        {SUMMARY.map((st) => (
          <div key={st} className="grid gap-0.5 rounded-xl bg-muted/60 py-2">
            <dd className="text-2xl font-bold">
              <bdi>{records.filter((r) => r.status === st).length}</bdi>
            </dd>
            <dt className="text-xs text-muted-foreground">{t(`live.status.${st}`)}</dt>
          </div>
        ))}
      </dl>
      <p className="text-center text-sm text-muted-foreground">
        {t('live.messagesQueued', { count: messagesQueued })}
      </p>
    </section>
  );
}

/**
 * The QR alone over the whole screen, above the app's header and tab bar (audit 3 LV2): portalled
 * to <body> so no animated parent traps the fixed layer, and in browser full screen where allowed.
 */
function FullScreen({ onExit, children }: { onExit: () => void; children: ReactNode }) {
  const { t } = useTranslation();
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const el = ref.current!;
    // iPhone Safari has no full screen for a page: the fixed layer is enough there.
    el.requestFullscreen?.().catch(() => {});
    // Leaving browser full screen (Esc, the back gesture) leaves this mode too.
    const onChange = () => {
      if (!document.fullscreenElement) onExit();
    };
    document.addEventListener('fullscreenchange', onChange);
    return () => {
      document.removeEventListener('fullscreenchange', onChange);
      if (document.fullscreenElement) void document.exitFullscreen();
    };
  }, [onExit]);
  return createPortal(
    <div ref={ref} className="fixed inset-0 z-[100] bg-background text-foreground">
      {/* A short landscape phone scrolls the QR and the list, with the floating bar. */}
      <ScrollArea className="h-full">
        <div className="grid min-h-dvh content-center gap-4 p-4">
          {children}
          <Button variant="outline" className="mx-auto" onClick={onExit}>
            <X aria-hidden />
            {t('live.exitFullScreen')}
          </Button>
        </div>
      </ScrollArea>
    </div>,
    document.body,
  );
}

function CloseButton({
  id,
  onClosed,
}: {
  id: string;
  onClosed: (result: CloseSessionResult) => void;
}) {
  const { t } = useTranslation();
  const [close, closing] = useCloseSessionMutation();
  const [confirming, setConfirming] = useState(false);
  return (
    <>
      <FormError message={closing.error && t(errorKey(closing.error))} />
      <Button
        variant={confirming ? 'destructive' : 'outline'}
        disabled={closing.isLoading}
        onClick={async () => {
          if (!confirming) return setConfirming(true);
          const res = await close({ id });
          if (res.data) onClosed(res.data);
        }}
      >
        {t(confirming ? 'live.confirmClose' : 'live.close')}
      </Button>
    </>
  );
}
