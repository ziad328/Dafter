import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import {
  type ListMessagesApiArg,
  type MessageSettings,
  useGetCurrentWorkspaceQuery,
  useGetMessageSettingsQuery,
  useListMessagesQuery,
  useUpdateMessageSettingsMutation,
} from '@/api/generated';
import { FormError, SelectField, Skeleton } from '@/components/Field';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { errorKey } from '@/lib/session';
import { intlLocale } from '@/lib/time';

type Status = NonNullable<ListMessagesApiArg['status']>;
const STATUSES: Status[] = ['queued', 'sent', 'failed'];
const TOGGLES: (keyof MessageSettings)[] = ['absence', 'sessionChange'];

/** Parent messages: the owner's switches, and the log (owner and assistant). */
export default function Messages() {
  const { t, i18n } = useTranslation();
  const [status, setStatus] = useState<Status | ''>('');
  const isOwner = useGetCurrentWorkspaceQuery().data?.role === 'owner';
  const settings = useGetMessageSettingsQuery();
  const [update, saving] = useUpdateMessageSettingsMutation();
  // Shown at once; dropped (back to the server's value) if the save fails.
  const [draft, setDraft] = useState<MessageSettings>();
  const shown = draft ?? settings.data;
  const toggle = (next: MessageSettings) => {
    setDraft(next);
    update({ messageSettings: next })
      .unwrap()
      .catch(() => setDraft(undefined));
  };
  const log = useListMessagesQuery(status ? { status } : {});
  const names = new Intl.ListFormat(i18n.language, { type: 'conjunction' });
  const time = new Intl.DateTimeFormat(intlLocale(i18n.language), {
    dateStyle: 'medium',
    timeStyle: 'short',
  });

  return (
    <div className="grid gap-4">
      <h1 className="text-xl font-bold">{t('messages.title')}</h1>

      <Card>
        <CardHeader>
          <CardTitle>
            <h2>{t('messages.settings')}</h2>
          </CardTitle>
        </CardHeader>
        <CardContent className="grid gap-3">
          {shown &&
            TOGGLES.map((key) => (
              <label key={key} className="flex items-center gap-2 text-sm">
                <input
                  type="checkbox"
                  className="size-4"
                  checked={shown[key]}
                  disabled={!isOwner}
                  onChange={(e) => toggle({ ...shown, [key]: e.target.checked })}
                />
                {t(`messages.toggles.${key}`)}
              </label>
            ))}
          {!isOwner && <p className="text-muted-foreground text-sm">{t('messages.ownerOnly')}</p>}
          <FormError message={saving.error && t(errorKey(saving.error))} />
        </CardContent>
      </Card>

      <SelectField
        label={t('messages.filter')}
        value={status}
        onChange={(e) => setStatus(e.target.value as Status | '')}
      >
        <option value="">{t('messages.all')}</option>
        {STATUSES.map((s) => (
          <option key={s} value={s}>
            {t(`messages.status.${s}`)}
          </option>
        ))}
      </SelectField>

      {log.isLoading ? (
        <Skeleton />
      ) : log.error ? (
        <FormError message={t(errorKey(log.error))} />
      ) : log.data?.length === 0 ? (
        <p>{t('messages.empty')}</p>
      ) : (
        <ul className="grid gap-2" data-testid="message-log">
          {log.data?.map((m) => (
            <li key={m.id} className="grid gap-1 rounded-md border p-3 text-sm">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <span className="flex gap-2 font-medium">
                  <span>{t(`messages.triggers.${m.trigger}`)}</span>
                  <span>{names.format(m.students)}</span>
                </span>
                <span
                  className={
                    m.status === 'failed'
                      ? 'text-destructive'
                      : m.status === 'sent'
                        ? 'text-muted-foreground'
                        : ''
                  }
                >
                  {t(`messages.status.${m.status}`)}
                </span>
              </div>
              <div className="text-muted-foreground flex flex-wrap gap-x-3">
                <bdi>{m.phone}</bdi>
                {m.guardianName && <span>{m.guardianName}</span>}
                <bdi>{time.format(new Date(m.sentAt ?? m.sendAfter))}</bdi>
              </div>
              {m.body && (
                <p dir={m.locale === 'en' ? 'ltr' : 'rtl'} className="text-start">
                  {m.body}
                </p>
              )}
              {m.status !== 'sent' && m.attempts > 0 && (
                <p className="text-muted-foreground text-xs">
                  {t('messages.attempts', { count: m.attempts })}
                </p>
              )}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
