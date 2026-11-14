import type { CheckIn } from '@dafter/contracts';
import { BrowserQRCodeReader, type IScannerControls } from '@zxing/browser';
import { SwitchCamera } from 'lucide-react';
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

const CAMERA_KEY = 'dafter.camera';
const savedCamera = () => {
  try {
    return localStorage.getItem(CAMERA_KEY) ?? undefined;
  } catch {
    return undefined;
  }
};

/** Student check-in: scan the teacher's screen, sign the code with this phone's key, send. */
export default function StudentScan() {
  const { t } = useTranslation();
  const video = useRef<HTMLVideoElement>(null);
  const [checkIn, { error }] = useCheckInMutation();
  const [done, setDone] = useState<CheckIn>();
  const [cameraBlocked, setCameraBlocked] = useState(false);
  // The camera the student picked last time (kept for the next class); none = the back camera.
  const [cameraId, setCameraId] = useState(savedCamera);
  const [cameras, setCameras] = useState<MediaDeviceInfo[]>([]);
  // The camera actually running, read when it starts (the stream can be gone by the time of a tap).
  const active = useRef<string>(undefined);
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
    let stream: MediaStream | undefined;
    const constraints = cameraId
      ? { video: { deviceId: { exact: cameraId } } }
      : { video: { facingMode: 'environment' } };
    // The stream is opened here, not by the reader, so the running camera's id is known for "switch".
    const start = async () => {
      stream = await navigator.mediaDevices.getUserMedia(constraints);
      if (stopped) return stream.getTracks().forEach((track) => track.stop());
      active.current = stream.getVideoTracks()[0]?.getSettings().deviceId ?? cameraId;
      controls = await new BrowserQRCodeReader().decodeFromStream(
        stream,
        video.current!,
        (result) => {
          const text = result?.getText();
          // The same window's code is sent once; the next window brings a new text.
          if (text && text !== last) {
            last = text;
            void submit(text);
          }
        },
      );
      if (stopped) return controls.stop();
      // Labels and the full list are only visible once the camera permission is granted.
      setCameras(await BrowserQRCodeReader.listVideoInputDevices());
    };
    // A remembered camera that is gone (another phone, unplugged): fall back to the back one.
    start().catch(() => (cameraId ? setCameraId(undefined) : setCameraBlocked(true)));
    if (import.meta.env.DEV) window.__dafterScan = submit;
    return () => {
      stopped = true;
      controls?.stop();
      stream?.getTracks().forEach((track) => track.stop());
      if (import.meta.env.DEV) delete window.__dafterScan;
    };
  }, [done, submit, cameraId]);

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

  const switchCamera = () => {
    const at = cameras.findIndex((c) => c.deviceId === active.current);
    const next = cameras[(at + 1) % cameras.length]!.deviceId;
    try {
      localStorage.setItem(CAMERA_KEY, next);
    } catch {
      // Private mode: the choice lasts until the page closes.
    }
    setCameraId(next);
  };

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
        {cameras.length > 1 && (
          <Button variant="outline" onClick={switchCamera}>
            <SwitchCamera aria-hidden />
            {t('scan.switchCamera')}
          </Button>
        )}
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
