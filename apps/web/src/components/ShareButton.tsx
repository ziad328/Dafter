import { Copy, Send } from 'lucide-react';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Button } from '@/components/ui/button';

/**
 * "Send" through the phone's share sheet (WhatsApp is one tap away); where the browser has no
 * share sheet, "Copy" instead, with a short "Copied" confirmation.
 */
export function ShareButton({ text, url }: { text: string; url?: string }) {
  const { t } = useTranslation();
  const [copied, setCopied] = useState(false);
  const canShare = typeof navigator.share === 'function';

  const onClick = async () => {
    if (canShare) {
      // A dismissed share sheet rejects with AbortError; nothing to do then.
      await navigator.share({ text, url }).catch(() => {});
      return;
    }
    await navigator.clipboard?.writeText(url ? `${text}\n${url}` : text).catch(() => {});
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <Button type="button" size="sm" className="print:hidden" onClick={() => void onClick()}>
      {canShare ? <Send aria-hidden /> : <Copy aria-hidden />}
      {canShare ? t('share.send') : copied ? t('share.copied') : t('share.copy')}
    </Button>
  );
}
