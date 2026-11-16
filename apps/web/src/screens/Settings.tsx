import { useState, type FormEvent } from 'react';
import { useTranslation } from 'react-i18next';
import {
  type AttendanceSettings,
  useGetAttendanceSettingsQuery,
  useGetCurrentWorkspaceQuery,
  useUpdateAttendanceSettingsMutation,
} from '@/api/generated';
import { Field, FormError, Skeleton } from '@/components/Field';
import { PageHeader, Panel } from '@/components/Page';
import { Button } from '@/components/ui/button';
import { errorKey } from '@/lib/session';

/**
 * Workspace rules (the owner edits), one titled section each (audit 3 R5): for now, when a
 * check-in counts as late; the center's name, logo and quiet hours would join as sections.
 */
export default function Settings() {
  const { t } = useTranslation();
  const settings = useGetAttendanceSettingsQuery();
  if (settings.isLoading) return <Skeleton />;
  if (!settings.data) return <FormError message={t(errorKey(settings.error))} />;
  return (
    <div className="grid gap-5">
      <PageHeader title={t('settings.title')} />
      {/* Mounted with the saved value, so the field starts from it. */}
      <LateForm saved={settings.data} />
    </div>
  );
}

function LateForm({ saved }: { saved: AttendanceSettings }) {
  const { t } = useTranslation();
  const isOwner = useGetCurrentWorkspaceQuery().data?.role === 'owner';
  const [update, saving] = useUpdateAttendanceSettingsMutation();
  const [minutes, setMinutes] = useState(String(saved.lateAfterMinutes));
  const [invalid, setInvalid] = useState(false);
  const [dirty, setDirty] = useState(false);

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    const n = Number(minutes);
    if (minutes.trim() === '' || !Number.isInteger(n) || n < 0 || n > 120) return setInvalid(true);
    setInvalid(false);
    setDirty(false);
    await update({ attendanceSettings: { lateAfterMinutes: n } });
  };

  return (
    <section aria-labelledby="settings-attendance">
      <Panel className="p-5">
        <form onSubmit={submit} noValidate className="grid gap-3">
          <h2 id="settings-attendance" className="font-semibold">
            {t('settings.attendance')}
          </h2>
          <Field
            label={t('settings.late')}
            hint={t('settings.lateHint')}
            type="number"
            inputMode="numeric"
            dir="ltr"
            readOnly={!isOwner}
            value={minutes}
            error={invalid ? t('settings.invalid') : undefined}
            onChange={(e) => {
              setMinutes(e.target.value);
              setDirty(true);
            }}
          />
          <FormError message={saving.error && t(errorKey(saving.error))} />
          {saving.isSuccess && !dirty && (
            <p role="status" className="text-sm text-present">
              {t('settings.saved')}
            </p>
          )}
          {isOwner ? (
            <Button type="submit" disabled={saving.isLoading}>
              {t('settings.save')}
            </Button>
          ) : (
            <p className="text-sm text-muted-foreground">{t('messages.ownerOnly')}</p>
          )}
        </form>
      </Panel>
    </section>
  );
}
