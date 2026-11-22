import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Navigate } from 'react-router';
import {
  type MessageSettings as Settings,
  useGetCurrentWorkspaceQuery,
  useGetMessageSettingsQuery,
  useUpdateMessageSettingsMutation,
} from '@/api/generated';
import { FormError, SelectField, Skeleton } from '@/components/Field';
import { MessageWording } from '@/components/MessageWording';
import { PageHeader, Panel } from '@/components/Page';
import { errorKey } from '@/lib/session';

type Toggle = Exclude<keyof Settings, 'feeReminderFromDay'>;
const TOGGLES: Toggle[] = ['absence', 'sessionChange', 'examResult', 'feeOverdue'];
// Short labels; the details sit in a hint line under them (audit 3 M3).
const HINTS: Toggle[] = ['absence', 'feeOverdue'];
// Up to the 28th, so every month has the day.
const DAYS = Array.from({ length: 28 }, (_, i) => i + 1);

/**
 * When parent messages go out and their wording (who gets them is set per student): the owner's page, one tap away from
 * the log so the log opens first (audit 3 M1).
 */
export default function MessageSettings() {
  const { t } = useTranslation();
  const workspace = useGetCurrentWorkspaceQuery().data;
  const isOwner = workspace?.role === 'owner';
  const settings = useGetMessageSettingsQuery(undefined, { skip: !isOwner });
  const [update, saving] = useUpdateMessageSettingsMutation();
  // Shown at once; dropped (back to the server's value) if the save fails.
  const [draft, setDraft] = useState<Settings>();
  const shown = draft ?? settings.data;
  if (!workspace) return <Skeleton />;
  if (!isOwner) return <Navigate to="/messages" replace />;
  const toggle = (next: Settings) => {
    setDraft(next);
    update({ updateMessageSettingsRequest: next })
      .unwrap()
      .catch(() => setDraft(undefined));
  };
  const switchFor = (key: Toggle) =>
    shown && (
      <div key={key} className="grid">
        <label className="flex min-h-10 items-center gap-3 text-sm">
          <input
            type="checkbox"
            className="size-5 shrink-0 accent-ink"
            checked={shown[key]}
            aria-describedby={HINTS.includes(key) ? `hint-${key}` : undefined}
            onChange={(e) => toggle({ ...shown, [key]: e.target.checked })}
          />
          {t(`messages.toggles.${key}`)}
        </label>
        {HINTS.includes(key) && (
          <p id={`hint-${key}`} className="-mt-2 ps-8 text-xs text-muted-foreground">
            {t(`messages.toggleHints.${key}` as never)}
          </p>
        )}
        {key === 'feeOverdue' && (
          <SelectField
            className="ps-8 text-sm sm:max-w-xs"
            label={t('messages.feeReminderFromDay')}
            value={String(shown.feeReminderFromDay)}
            onChange={(e) => toggle({ ...shown, feeReminderFromDay: Number(e.target.value) })}
          >
            {DAYS.map((d) => (
              <option key={d} value={d}>
                {d}
              </option>
            ))}
          </SelectField>
        )}
      </div>
    );

  return (
    <div className="grid gap-5">
      <PageHeader title={t('messages.settingsTitle')} />
      <Panel className="grid gap-3 p-5">
        <h2 className="font-semibold">{t('messages.settings')}</h2>
        {settings.isLoading && <Skeleton />}
        {shown && TOGGLES.map((key) => switchFor(key))}
        <FormError
          message={(saving.error ?? settings.error) && t(errorKey(saving.error ?? settings.error))}
        />
      </Panel>
      <MessageWording canEdit />
    </div>
  );
}
