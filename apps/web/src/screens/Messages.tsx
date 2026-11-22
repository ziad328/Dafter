import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Settings2 } from 'lucide-react';
import { Link } from 'react-router';
import {
  type OutboxMessage,
  type ListMessagesApiArg,
  useGetCurrentWorkspaceQuery,
  useListMessagesQuery,
} from '@/api/generated';
import { FormError, Skeleton } from '@/components/Field';
import { MorePages } from '@/components/MorePages';
import { PageHeader, Panel } from '@/components/Page';
import { Button } from '@/components/ui/button';
import { errorKey } from '@/lib/session';
import { dayLabel, displayTime, localDate } from '@/lib/time';
import { cn } from '@/lib/utils';

type Status = NonNullable<ListMessagesApiArg['status']>;
const STATUSES: Status[] = ['queued', 'sent', 'failed', 'skipped'];
const PILL: Record<Status, string> = {
  queued: 'bg-amber-soft text-amber',
  sent: 'bg-present-soft text-present',
  failed: 'bg-rose-soft text-rose',
  skipped: 'bg-muted text-muted-foreground',
};

/**
 * Parent messages: the log. A teacher sees only the log of their own groups, with phones masked by
 * the API; the owner's settings are on `/messages/settings`.
 */
// The API's page size for the log (GET /messages).
const MESSAGE_PAGE = 100;

export default function Messages() {
  const { t, i18n } = useTranslation();
  const [status, setStatus] = useState<Status | ''>('');
  // The row whose text is open: tap a row to read the message (audit 3 M2).
  const [open, setOpen] = useState<string>();
  const workspace = useGetCurrentWorkspaceQuery().data;
  const isOwner = workspace?.role === 'owner';
  const isTeacher = workspace?.role === 'teacher';
  const tz = workspace?.timezone ?? 'Africa/Cairo';
  const args = status ? { status } : {};
  const log = useListMessagesQuery(args);
  const useNextPage = (after: string) => useListMessagesQuery({ ...args, after });
  const names = new Intl.ListFormat(i18n.language, { type: 'conjunction' });
  // The same "السبت 14 نوفمبر · 8:00 ص" as the rest of the app.
  const when = (at: string) =>
    `${dayLabel(localDate(at, tz), i18n.language)} · ${displayTime(at, tz, i18n.language)}`;

  const row = (m: OutboxMessage) => {
    // Closed at night: held for quiet hours, and the one time shown says until when.
    const held =
      m.status === 'queued' &&
      m.attempts === 0 &&
      Date.parse(m.sendAfter) - Date.parse(m.createdAt) > 60_000;
    return (
      <li key={m.id} className="grid gap-1 px-4 py-3 text-sm">
        <button
          type="button"
          disabled={!m.body}
          aria-expanded={m.body ? open === m.id : undefined}
          onClick={() => setOpen(open === m.id ? undefined : m.id)}
          className="flex flex-wrap items-center justify-between gap-2 rounded-md text-start focus-visible:outline-2 disabled:cursor-default"
        >
          <span className="grid">
            <span className="text-xs font-medium text-muted-foreground">
              {t(`messages.triggers.${m.trigger}`)}
            </span>
            <span className="font-semibold">{names.format(m.students)}</span>
          </span>
          <span className={cn('rounded-full px-2.5 py-0.5 text-xs font-medium', PILL[m.status])}>
            {t(`messages.status.${m.status}`)}
          </span>
        </button>
        <div className="flex flex-wrap gap-x-3 text-muted-foreground">
          <bdi>{m.phone}</bdi>
          {m.guardianName && <span>{m.guardianName}</span>}
          {held ? (
            <span>
              {t('messages.heldUntil', {
                time: displayTime(m.sendAfter, tz, i18n.language),
              })}
            </span>
          ) : (
            <bdi>{when(m.sentAt ?? m.sendAfter)}</bdi>
          )}
        </div>
        {/* Re-checked when it was due, and no longer true: says why it never went out. */}
        {m.skipReason && (
          <p className="text-xs text-muted-foreground">
            {t(`messages.skipReason.${m.skipReason}`)}
          </p>
        )}
        {m.body && open === m.id && (
          <p
            dir={m.locale === 'en' ? 'ltr' : 'rtl'}
            className="rounded-md bg-ink-soft/50 p-2 text-start"
          >
            {m.body}
          </p>
        )}
        {m.status !== 'sent' && m.attempts > 0 && (
          <p className="text-xs text-muted-foreground">
            {t('messages.attempts', { count: m.attempts })}
          </p>
        )}
      </li>
    );
  };
  return (
    <div className="grid gap-5">
      {/* The log opens first; the owner's switches and wording sit behind the gear (audit 3 M1). */}
      <PageHeader
        title={t('messages.title')}
        action={
          isOwner && (
            <Button asChild variant="outline">
              <Link to="/messages/settings">
                <Settings2 aria-hidden />
                {t('messages.settingsTitle')}
              </Link>
            </Button>
          )
        }
      />

      {isTeacher && <p className="text-sm text-muted-foreground">{t('messages.teacherView')}</p>}

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
            {log.data?.map(row)}
          </ul>
          <MorePages key={status} first={log.data ?? []} size={MESSAGE_PAGE} usePage={useNextPage}>
            {(rows) => <ul className="divide-y border-t">{rows.map(row)}</ul>}
          </MorePages>
        </Panel>
      )}
    </div>
  );
}
