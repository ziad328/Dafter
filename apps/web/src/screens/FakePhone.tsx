import { useTranslation } from 'react-i18next';
import { useGetCurrentWorkspaceQuery, useListFakePhoneMessagesQuery } from '@/api/generated';
import { FormError, Skeleton } from '@/components/Field';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { errorKey } from '@/lib/session';
import { dayLabel, displayTime, localDate } from '@/lib/time';

/** Development and demos: what the console provider "sent", one phone per guardian. */
export default function FakePhone() {
  const { t, i18n } = useTranslation();
  // The worker polls the outbox every minute, so a short poll here is enough to look live.
  const { data, error, isLoading } = useListFakePhoneMessagesQuery(undefined, {
    pollingInterval: 5000,
  });
  const tz = useGetCurrentWorkspaceQuery().data?.timezone ?? 'Africa/Cairo';
  if (isLoading) return <Skeleton />;
  if (error || !data) return <FormError message={t(errorKey(error))} />;

  // Not Map.groupBy: iPhones before iOS 17.4 lack it.
  const byPhone = new Map<string, typeof data>();
  for (const m of data) byPhone.set(m.phone, [...(byPhone.get(m.phone) ?? []), m]);
  // The same «السبت 14 نوفمبر · 8:00 ص» as the message log (audit 3 M4).
  const when = (at: string) =>
    `${dayLabel(localDate(at, tz), i18n.language)} · ${displayTime(at, tz, i18n.language)}`;
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
              <div key={m.id} className="bg-muted grid gap-1 rounded-lg p-3 text-sm">
                {/* Each bubble takes the direction of its own text, so English stays readable. */}
                <p dir="auto" className="text-start">
                  {m.body}
                </p>
                <time className="text-muted-foreground block text-xs" dateTime={m.sentAt}>
                  {when(m.sentAt)}
                </time>
              </div>
            ))}
          </CardContent>
        </Card>
      ))}
    </div>
  );
}
