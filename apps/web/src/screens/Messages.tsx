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
import { FormError, Skeleton } from '@/components/Field';
import { PageHeader, Panel } from '@/components/Page';
import { errorKey } from '@/lib/session';
import { dayLabel, displayTime, localDate } from '@/lib/time';
import { cn } from '@/lib/utils';

type Status = NonNullable<ListMessagesApiArg['status']>;
const STATUSES: Status[] = ['queued', 'sent', 'failed'];
const PILL: Record<Status, string> = {
  queued: 'bg-amber-soft text-amber',
  sent: 'bg-present-soft text-present',
  failed: 'bg-rose-soft text-rose',
};
const TOGGLES: (keyof MessageSettings)[] = ['absence', 'sessionChange', 'examResult'];

/** Parent messages: the owner's switches, and the log (owner and assistant). */
export default function Messages() {
  const { t, i18n } = useTranslation();
  const [status, setStatus] = useState<Status | ''>('');
  const workspace = useGetCurrentWorkspaceQuery().data;
  const isOwner = workspace?.role === 'owner';
  const tz = workspace?.timezone ?? 'Africa/Cairo';
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
  // The same "السبت 14 نوفمبر · 8:00 ص" as the rest of the app.
  const when = (at: string) =>
    `${dayLabel(localDate(at, tz), i18n.language)} · ${displayTime(at, tz, i18n.language)}`;

  return (
    <div className="grid gap-5">
      <PageHeader title={t('messages.title')} />

      <Panel className="grid gap-3 p-5">
        <h2 className="font-semibold">{t('messages.settings')}</h2>
        {shown &&
          TOGGLES.map((key) => (
            <label key={key} className="flex min-h-10 items-center gap-3 text-sm">
              <input
                type="checkbox"
                className="size-5 accent-ink"
                checked={shown[key]}
                disabled={!isOwner}
                onChange={(e) => toggle({ ...shown, [key]: e.target.checked })}
              />
              {t(`messages.toggles.${key}`)}
            </label>
          ))}
        {!isOwner && <p className="text-sm text-muted-foreground">{t('messages.ownerOnly')}</p>}
        <FormError message={saving.error && t(errorKey(saving.error))} />
      </Panel>

      <div role="group" aria-label={t('messages.filter')} className="flex flex-wrap gap-2">
        {(['', ...STATUSES] as const).map((s) => (
          <button
            key={s || 'all'}
            type="button"
            aria-pressed={status === s}
            onClick={() => setStatus(s)}
            className={cn(
              'h-9 rounded-full border px-4 text-sm font-medium transition-colors',
              status === s
                ? 'border-ink bg-ink text-primary-foreground'
                : 'bg-card hover:bg-ink-soft',
            )}
          >
            {s ? t(`messages.status.${s}`) : t('messages.all')}
          </button>
        ))}
      </div>

      {log.isLoading ? (
        <Skeleton />
      ) : log.error ? (
        <FormError message={t(errorKey(log.error))} />
      ) : log.data?.length === 0 ? (
        <Panel className="p-8 text-center text-muted-foreground">{t('messages.empty')}</Panel>
      ) : (
        <Panel className="overflow-hidden">
          <ul className="divide-y" data-testid="message-log">
            {log.data?.map((m) => (
              <li key={m.id} className="grid gap-1 px-4 py-3 text-sm">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <span className="grid">
                    <span className="text-xs font-medium text-muted-foreground">
                      {t(`messages.triggers.${m.trigger}`)}
                    </span>
                    <span className="font-semibold">{names.format(m.students)}</span>
                  </span>
                  <span
                    className={cn('rounded-full px-2.5 py-0.5 text-xs font-medium', PILL[m.status])}
                  >
                    {t(`messages.status.${m.status}`)}
                  </span>
                </div>
                <div className="flex flex-wrap gap-x-3 text-muted-foreground">
                  <bdi>{m.phone}</bdi>
                  {m.guardianName && <span>{m.guardianName}</span>}
                  <bdi>{when(m.sentAt ?? m.sendAfter)}</bdi>
                </div>
                {/* Held, not stuck: closed at night, it waits for quiet hours to end. */}
                {m.status === 'queued' &&
                  m.attempts === 0 &&
                  Date.parse(m.sendAfter) - Date.parse(m.createdAt) > 60_000 && (
                    <p className="text-xs text-muted-foreground">
                      {t('messages.heldUntil', {
                        time: displayTime(m.sendAfter, tz, i18n.language),
                      })}
                    </p>
                  )}
                {m.body && (
                  <p dir={m.locale === 'en' ? 'ltr' : 'rtl'} className="text-start">
                    {m.body}
                  </p>
                )}
                {m.status !== 'sent' && m.attempts > 0 && (
                  <p className="text-xs text-muted-foreground">
                    {t('messages.attempts', { count: m.attempts })}
                  </p>
                )}
              </li>
            ))}
          </ul>
        </Panel>
      )}
    </div>
  );
}
