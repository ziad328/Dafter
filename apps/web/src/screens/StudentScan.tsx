import type { CheckIn } from '@dafter/contracts';
import { BrowserQRCodeReader, type IScannerControls } from '@zxing/browser';
import { useCallback, useEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Link } from 'react-router';
import { useCheckInMutation } from '@/api/generated';
import { FormError } from '@/components/Field';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { deviceKey, signWithDevice } from '@/lib/device-key';
import { errorKey } from '@/lib/session';

declare global {
  interface Window {
    /** Development only: Playwright has no camera, so it hands the decoded text in here. */
    __dafterScan?: (text: string) => Promise<void>;
  }
}

/** Student check-in: scan the teacher's screen, sign the code with this phone's key, send. */
export default function StudentScan() {
  const { t } = useTranslation();
  const video = useRef<HTMLVideoElement>(null);
  const [checkIn, { error }] = useCheckInMutation();
  const [done, setDone] = useState<CheckIn>();
  const [cameraBlocked, setCameraBlocked] = useState(false);
  const busy = useRef(false);

  const submit = useCallback(
    async (code: string) => {
      if (busy.current) return;
      busy.current = true;
      try {
        const signature = await signWithDevice(await deviceKey(), code);
        const res = await checkIn({ checkInRequest: { code, signature } });
        if (res.data) setDone(res.data);
      } finally {
        busy.current = false;
      }
    },
    [checkIn],
  );

  useEffect(() => {
    if (done) return;
    let controls: IScannerControls | undefined;
    let stopped = false;
    let last = '';
    const reader = new BrowserQRCodeReader();
    reader
      .decodeFromConstraints({ video: { facingMode: 'environment' } }, video.current!, (result) => {
        const text = result?.getText();
        // The same window's code is sent once; the next window brings a new text.
        if (text && text !== last) {
          last = text;
          void submit(text);
        }
      })
      .then((c) => (stopped ? c.stop() : (controls = c)))
      .catch(() => setCameraBlocked(true));
    if (import.meta.env.DEV) window.__dafterScan = submit;
    return () => {
      stopped = true;
      controls?.stop();
      if (import.meta.env.DEV) delete window.__dafterScan;
    };
  }, [done, submit]);

  if (done)
    return (
      <Card>
        <CardHeader>
          <CardTitle>
            <h1 role="status" className="text-center text-3xl">
              {t(`scan.done.${done.status}`)}
            </h1>
          </CardTitle>
        </CardHeader>
        <CardContent className="grid gap-3">
          <Button asChild>
            <Link to="/s">{t('scan.back')}</Link>
          </Button>
        </CardContent>
      </Card>
    );

  const code = error ? errorKey(error) : undefined;
  return (
    <Card>
      <CardHeader>
        <CardTitle>
          <h1>{t('scan.title')}</h1>
        </CardTitle>
      </CardHeader>
      <CardContent className="grid gap-3">
        <video
          ref={video}
          className="aspect-square w-full rounded-md bg-black object-cover"
          muted
          playsInline
        />
        <p className="text-sm text-muted-foreground">{t('scan.hint')}</p>
        {cameraBlocked && <FormError message={t('scan.cameraBlocked')} />}
        {/* An expired code just means "scan again": the camera is still running. */}
        <FormError
          message={code && t(code === 'errors.CHECKIN_CODE_EXPIRED' ? 'scan.again' : code)}
        />
      </CardContent>
    </Card>
  );
}
