import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Navigate } from 'react-router';
import {
  type MessageSettings as Settings,
  useGetCurrentWorkspaceQuery,
  useGetMessageSettingsQuery,
  useUpdateMessageSettingsMutation,
} from '@/api/generated';
import { FormError, Skeleton } from '@/components/Field';
import { MessageWording } from '@/components/MessageWording';
import { PageHeader, Panel } from '@/components/Page';
import { errorKey } from '@/lib/session';

const TOGGLES: (keyof Settings)[] = ['absence', 'sessionChange', 'examResult', 'feeOverdue'];

/**
 * When parent messages go out, to whom, and their wording: the owner's page, one tap away from
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
    update({ messageSettings: next })
      .unwrap()
      .catch(() => setDraft(undefined));
  };
  const switchFor = (key: keyof Settings) =>
    shown && (
      <label key={key} className="flex min-h-10 items-center gap-3 text-sm">
        <input
          type="checkbox"
          className="size-5 accent-ink"
          checked={shown[key]}
          onChange={(e) => toggle({ ...shown, [key]: e.target.checked })}
        />
        {t(`messages.toggles.${key}`)}
      </label>
    );

  return (
    <div className="grid gap-5">
      <PageHeader title={t('messages.settingsTitle')} />
      <Panel className="grid gap-3 p-5">
        <h2 className="font-semibold">{t('messages.settings')}</h2>
        {settings.isLoading && <Skeleton />}
        {shown && (
          <>
            {TOGGLES.map((key) => switchFor(key))}
            {/* Who gets them, not when: a heading of its own. */}
            <h3 className="mt-2 text-sm font-semibold">{t('messages.recipients')}</h3>
            {switchFor('primaryOnly')}
          </>
        )}
        <FormError
          message={(saving.error ?? settings.error) && t(errorKey(saving.error ?? settings.error))}
        />
      </Panel>
      <MessageWording canEdit />
    </div>
  );
}
