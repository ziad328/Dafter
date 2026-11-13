import { useEffect, useState } from 'react';
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
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { deviceKey, publicKeySpki } from '@/lib/device-key';
import { itemName } from '@/lib/groups';
import { isInstalled } from '@/lib/pwa';
import { errorKey } from '@/lib/session';
import { dayLabel, localDate, localTime } from '@/lib/time';

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

/** Student home: binds this phone, then my schedule (14 days), Scan, and my attendance. */
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
      <Card>
        <CardHeader>
          <CardTitle>
            <h1>{t('studentApp.welcome', { name: me.data?.name ?? '' })}</h1>
          </CardTitle>
        </CardHeader>
        <CardContent className="grid gap-2">
          <p role="status" className="text-sm">
            {state === 'binding' && t('studentApp.binding')}
            {state === 'bound' && t('studentApp.bound')}
          </p>
          {state === 'bound' && (
            <Button asChild>
              <Link to="/s/scan">{t('scan.open')}</Link>
            </Button>
          )}
          {(state === 'otherPhone' || state === 'failed') && (
            <FormError message={t(`studentApp.bindErrors.${state}`)} />
          )}
        </CardContent>
      </Card>
      <Schedule />
      <History />
    </>
  );
}

function Schedule() {
  const { t, i18n } = useTranslation();
  const { data, isLoading } = useGetMyScheduleQuery();
  if (isLoading) return <Skeleton />;
  return (
    <Card>
      <CardHeader>
        <CardTitle>
          <h2>{t('studentApp.schedule')}</h2>
        </CardTitle>
      </CardHeader>
      <CardContent>
        {!data?.length ? (
          <p className="text-sm text-muted-foreground">{t('studentApp.noSessions')}</p>
        ) : (
          <ul className="grid gap-3" data-testid="my-schedule">
            {data.map((s: MySession) => (
              <li key={s.id} className="grid gap-0.5 text-sm">
                <span className="font-medium">
                  {`${dayLabel(localDate(s.startsAt, s.timezone), i18n.language)} · `}
                  <bdi dir="ltr">{`${localTime(s.startsAt, s.timezone)}–${localTime(s.endsAt, s.timezone)}`}</bdi>
                </span>
                <span>
                  {[
                    itemName(s.subject, i18n.language),
                    s.teacherName,
                    centerName(s.center, i18n.language),
                  ].join(' · ')}
                  {s.status === 'cancelled' && ` · ${t('timetable.status.cancelled')}`}
                </span>
              </li>
            ))}
          </ul>
        )}
      </CardContent>
    </Card>
  );
}

function History() {
  const { t, i18n } = useTranslation();
  const { data, isLoading } = useGetMyAttendanceQuery();
  if (isLoading) return <Skeleton />;
  return (
    <Card>
      <CardHeader>
        <CardTitle>
          <h2>{t('studentApp.history')}</h2>
        </CardTitle>
      </CardHeader>
      <CardContent>
        {!data?.length ? (
          <p className="text-sm text-muted-foreground">{t('studentApp.noHistory')}</p>
        ) : (
          <ul className="grid gap-2" data-testid="my-attendance">
            {data.map((r: MyAttendanceRecord) => (
              <li key={r.sessionId} className="flex justify-between gap-2 text-sm">
                <span>
                  {`${dayLabel(localDate(r.startsAt, r.timezone), i18n.language)} · ${itemName(r.subject, i18n.language)}`}
                </span>
                <span className="text-muted-foreground">{t(`live.status.${r.status}`)}</span>
              </li>
            ))}
          </ul>
        )}
      </CardContent>
    </Card>
  );
}

const centerName = (c: MySession['center'], lang: string) =>
  lang === 'en' && c.nameEn ? c.nameEn : c.nameAr;
