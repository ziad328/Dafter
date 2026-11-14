import type { AttendanceRecord, OpenSession, RosterEntry } from '@dafter/contracts';
import QRCode from 'qrcode';
import { useEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useDispatch } from 'react-redux';
import { Link, useParams } from 'react-router';
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
import { itemName } from '@/lib/groups';
import { importQrKey, qrText } from '@/lib/qr';
import { errorKey } from '@/lib/session';
import { displayTime, localDate } from '@/lib/time';
import { cn } from '@/lib/utils';
import type { AppDispatch } from '@/store';

type Records = Map<string, AttendanceRecord>;

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
  const roster = useGetSessionRosterQuery({ id: id! });
  const [records, setRecords] = useState<Records>(new Map());
  const [closed, setClosed] = useState(false);
  const dispatch = useDispatch<AppDispatch>();
  const [session, setSession] = useState<{ open: OpenSession; offset: number }>();

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

  if (opened.error) return <FormError message={t(errorKey(opened.error))} />;
  if (!session) return <Skeleton />;

  // Everyone expected (by name), then make-ups who checked in without being enrolled.
  const name = (r: { nameAr: string; nameEn: string | null }) =>
    i18n.language === 'en' && r.nameEn ? r.nameEn : r.nameAr;
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
          <p role="status" className="text-center text-lg font-medium">
            {t('live.closed')}
          </p>
        ) : (
          <RotatingQr session={session.open} offset={session.offset} />
        )}
      </div>
      <div className="grid gap-4">
        <div className="text-center" aria-live="polite">
          <p key={here} className="animate-in text-3xl font-bold zoom-in-90 duration-300">
            {t('live.count', { count: here })}
          </p>
          {expected.length > 0 && (
            <p className="text-sm text-muted-foreground">
              {t('live.expected', { count: expected.length })}
            </p>
          )}
        </div>
        <Card>
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
          <Button asChild variant="outline">
            <Link to="/timetable">{t('live.back')}</Link>
          </Button>
        ) : (
          <CloseButton
            id={id!}
            onClosed={(rows) => {
              setRecords((m) => rows.reduce(merge, m));
              setClosed(true);
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
      </h1>
      <p className="text-sm text-muted-foreground">
        {`${s.teacherName} · `}
        <bdi>{`${displayTime(s.startsAt, tz, i18n.language)} – ${displayTime(s.endsAt, tz, i18n.language)}`}</bdi>
      </p>
    </header>
  );
}

/** One student: their status, or a one-tap "present" for students without a phone. */
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
  const markable = !record || record.status === 'absent';
  return (
    <li
      // A new record replays the green flash, so a fresh check-in catches the eye.
      key={record?.recordedAt}
      className={cn(
        'flex min-h-12 items-center justify-between gap-2 rounded-lg px-2 py-1 text-sm',
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
          onClick={async () => {
            const res = await mark({
              id: sessionId,
              studentId,
              markAttendanceRequest: { status: 'present' },
            });
            if (res.data) onMarked(res.data);
          }}
        >
          {t('live.present')}
        </Button>
      ) : (
        <span className="text-muted-foreground">{t(`live.status.${record.status}`)}</span>
      )}
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

function CloseButton({
  id,
  onClosed,
}: {
  id: string;
  onClosed: (rows: AttendanceRecord[]) => void;
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
