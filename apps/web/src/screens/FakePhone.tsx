import { useTranslation } from 'react-i18next';
import { useListFakePhoneMessagesQuery } from '@/api/generated';
import { FormError, Skeleton } from '@/components/Field';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { errorKey } from '@/lib/session';
import { intlLocale } from '@/lib/time';

/** Development and demos: what the console provider "sent", one phone per guardian. */
export default function FakePhone() {
  const { t, i18n } = useTranslation();
  // The worker polls the outbox every minute, so a short poll here is enough to look live.
  const { data, error, isLoading } = useListFakePhoneMessagesQuery(undefined, {
    pollingInterval: 5000,
  });
  if (isLoading) return <Skeleton />;
  if (error || !data) return <FormError message={t(errorKey(error))} />;

  const byPhone = Map.groupBy(data, (m) => m.phone);
  const time = new Intl.DateTimeFormat(intlLocale(i18n.language), {
    dateStyle: 'medium',
    timeStyle: 'short',
  });
  return (
    <div className="grid gap-4">
      <header>
        <h1 className="text-xl font-bold">{t('phone.title')}</h1>
        <p className="text-muted-foreground text-sm">{t('phone.hint')}</p>
      </header>
      {byPhone.size === 0 && <p>{t('phone.empty')}</p>}
      {[...byPhone].map(([phone, messages]) => (
        <Card key={phone} data-testid="fake-phone" className="max-w-sm">
          <CardHeader>
            <CardTitle>
              <bdi>{phone}</bdi>
            </CardTitle>
            {messages[0]!.guardianName && (
              <CardDescription>{messages[0]!.guardianName}</CardDescription>
            )}
          </CardHeader>
          <CardContent className="grid gap-2">
            {messages.map((m) => (
              <div
                key={m.id}
                dir={m.locale === 'ar' ? 'rtl' : 'ltr'}
                className="bg-muted rounded-lg p-3 text-start text-sm"
              >
                <p>{m.body}</p>
                <time className="text-muted-foreground block text-xs" dateTime={m.sentAt}>
                  <bdi>{time.format(new Date(m.sentAt))}</bdi>
                </time>
              </div>
            ))}
          </CardContent>
        </Card>
      ))}
    </div>
  );
}
