import { WifiOff } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { Panel } from '@/components/Page';
import { Button } from '@/components/ui/button';

/**
 * The student app with no network: one calm screen instead of a page of errors. The app shell
 * itself comes from the service worker; a scan needs the server, so nothing else is offered.
 * Data refetches by itself when the network comes back (RTK Query's refetchOnReconnect).
 */
export function OfflineScreen() {
  const { t } = useTranslation();
  return (
    <Panel className="grid justify-items-center gap-3 p-8 text-center">
      <WifiOff aria-hidden className="size-10 text-muted-foreground" />
      <h1 className="text-lg font-bold">{t('offline.title')}</h1>
      <p role="alert" className="text-sm text-muted-foreground">
        {t('offline.body')}
      </p>
      <Button variant="outline" onClick={() => window.dispatchEvent(new Event('online'))}>
        {t('offline.retry')}
      </Button>
    </Panel>
  );
}

/** Staff screens with no network: a slim line on top; what was loaded stays readable. */
export function OfflineBanner() {
  const { t } = useTranslation();
  return (
    <p
      role="status"
      className="flex items-center justify-center gap-2 bg-late-soft px-4 py-2 text-sm text-late print:hidden"
    >
      <WifiOff aria-hidden className="size-4" />
      {t('offline.banner')}
    </p>
  );
}
