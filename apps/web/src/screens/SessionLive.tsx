import type { AttendanceRecord, OpenSession } from '@dafter/contracts';
import QRCode from 'qrcode';
import { useEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useDispatch } from 'react-redux';
import { Link, useParams } from 'react-router';
import { useCloseSessionMutation, useOpenSessionMutation } from '@/api/generated';
import { streamEvents } from '@/api/sse';
import { FormError, Skeleton } from '@/components/Field';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { importQrKey, qrText } from '@/lib/qr';
import { errorKey } from '@/lib/session';
import type { AppDispatch } from '@/store';

type Records = Map<string, AttendanceRecord>;

/** Keeps the newest record per student (a snapshot row may arrive after a live one). */
const merge = (records: Records, r: AttendanceRecord) => {
  const old = records.get(r.studentId);
  if (old && old.recordedAt > r.recordedAt) return records;
  return new Map(records).set(r.studentId, r);
};

/** Teacher's full-screen session: rotating QR, live check-ins, close. */
export default function SessionLive() {
  const { t } = useTranslation();
  const { id } = useParams();
  const [open, opened] = useOpenSessionMutation();
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

  const list = [...records.values()].sort((a, b) => b.recordedAt.localeCompare(a.recordedAt));
  const here = list.filter((r) => r.status !== 'absent').length;

  return (
    <div className="grid gap-4">
      {closed ? (
        <p role="status" className="text-center text-lg font-medium">
          {t('live.closed')}
        </p>
      ) : (
        <RotatingQr session={session.open} offset={session.offset} />
      )}
      <p className="text-center text-2xl font-bold" aria-live="polite">
        {t('live.count', { count: here })}
      </p>
      <Card>
        <CardHeader>
          <CardTitle>
            <h2>{t('live.list')}</h2>
          </CardTitle>
        </CardHeader>
        <CardContent>
          <ul className="grid gap-2" data-testid="live-list">
            {list.map((r) => (
              <li key={r.studentId} className="flex justify-between gap-2 text-sm">
                <span>{r.nameAr}</span>
                <span className="text-muted-foreground">{t(`live.status.${r.status}`)}</span>
              </li>
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
  );
}

/** Draws a new QR whenever the 10-second window changes on the server's clock. */
function RotatingQr({ session, offset }: { session: OpenSession; offset: number }) {
  const { t } = useTranslation();
  const [qr, setQr] = useState<{ text: string; image: string }>();
  const last = useRef(-1);

  useEffect(() => {
    let alive = true;
    const keyPromise = importQrKey(session.qrKey);
    const tick = async () => {
      const window = Math.floor((Date.now() + offset) / session.windowMs);
      if (window === last.current) return;
      last.current = window;
      const text = await qrText(await keyPromise, session.sessionId, window);
      const image = await QRCode.toDataURL(text, { margin: 1, width: 640 });
      if (alive) setQr({ text, image });
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
    <img
      src={qr.image}
      alt={t('live.qrAlt')}
      data-testid="session-qr"
      data-code={qr.text}
      className="mx-auto aspect-square w-full max-w-md rounded-md bg-white p-2"
    />
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
