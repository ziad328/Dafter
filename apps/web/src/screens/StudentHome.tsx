import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Link } from 'react-router';
import { useBindDeviceMutation, useGetMeQuery } from '@/api/generated';
import { FormError, Skeleton } from '@/components/Field';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { deviceKey, publicKeySpki } from '@/lib/device-key';
import { errorKey } from '@/lib/session';

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

/** Student home (placeholder until Day 14's schedule). */
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
    return () => {
      cancelled = true;
    };
  }, [bind]);

  if (me.isLoading) return <Skeleton />;
  return (
    <Card>
      <CardHeader>
        <CardTitle>
          <h1>{t('studentApp.welcome', { name: me.data?.name ?? '' })}</h1>
        </CardTitle>
        <CardDescription>{t('studentApp.comingSoon')}</CardDescription>
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
  );
}
