import type { Enrollment, Student } from '@dafter/contracts';
import { useState } from 'react';
import { useLocation } from 'react-router';
import { useTranslation } from 'react-i18next';
import {
  useCreateEnrollmentMutation,
  useCreateStudentInviteMutation,
  useLeaveEnrollmentMutation,
  useListEnrollmentsQuery,
  useListGroupsQuery,
  useResetStudentDeviceMutation,
} from '@/api/generated';
import { Field, FormError, SelectField } from '@/components/Field';
import { ShareButton } from '@/components/ShareButton';
import { MoreHorizontal } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { groupName, itemName } from '@/lib/groups';
import { errorDetails, errorKey } from '@/lib/session';

/** GROUP_FULL: «المجموعة مكتملة (20/20). إضافة على أي حال؟» with Add anyway and Cancel. */
export function GroupFullConfirm({
  full,
  busy,
  onConfirm,
  onCancel,
}: {
  full: Record<string, string>;
  busy: boolean;
  onConfirm: () => void;
  onCancel: () => void;
}) {
  const { t } = useTranslation();
  return (
    <div
      role="alert"
      className="grid gap-2 rounded-md border border-late/40 bg-late-soft p-3 text-sm"
    >
      <p>
        {t('enrollments.full', {
          // Isolated, so "20/20" keeps its order inside an Arabic sentence (rule 5).
          seats: `\u2068${full.count}/${full.capacity}\u2069`,
        })}
      </p>
      <div className="flex gap-2">
        <Button type="button" size="sm" disabled={busy} onClick={onConfirm}>
          {t('enrollments.addAnyway')}
        </Button>
        <Button type="button" size="sm" variant="ghost" disabled={busy} onClick={onCancel}>
          {t('enrollments.cancelAdd')}
        </Button>
      </div>
    </div>
  );
}

/** Groups the student is in, with add and leave. Only groups the caller can see are offered. */
export function Enrollments({ studentId }: { studentId: string }) {
  const { t, i18n } = useTranslation();
  const list = useListEnrollmentsQuery({ id: studentId });
  const groups = useListGroupsQuery();
  const [enroll, enrolled] = useCreateEnrollmentMutation();
  const [leave, left] = useLeaveEnrollmentMutation();
  const [groupId, setGroupId] = useState('');
  const [discount, setDiscount] = useState('');
  // The form opens on demand, so the card reads as a list first (audit ST1).
  const [adding, setAdding] = useState(false);
  const active = list.data?.filter((e) => e.status === 'active') ?? [];
  const name = (e: Pick<Enrollment, 'subject' | 'gradeLevel' | 'teacherName'>) =>
    `${itemName(e.subject, i18n.language)} · ${itemName(e.gradeLevel, i18n.language)} · ${e.teacherName}`;
  const pct = Number(discount || 0);
  // Set by the new-student form when the student was saved but joining the group failed.
  const fromCreate = (useLocation().state as { enrollError?: string } | null)?.enrollError;

  const full = errorDetails(enrolled.error, 'GROUP_FULL');

  // force: the staff member confirmed adding to a full group.
  const onAdd = async (force?: true) => {
    const res = await enroll({
      id: studentId,
      createEnrollmentRequest: { groupId, discountPct: pct, force },
    });
    if (res.data) {
      setGroupId('');
      setDiscount('');
      setAdding(false);
    }
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle>
          <h2>{t('enrollments.title')}</h2>
        </CardTitle>
      </CardHeader>
      <CardContent className="grid gap-3">
        {fromCreate && active.length === 0 && (
          <FormError message={`${t('enrollments.notJoined')} ${t(fromCreate as never)}`} />
        )}
        {active.length === 0 && (
          <p className="text-sm text-muted-foreground">{t('enrollments.empty')}</p>
        )}
        <ul className="grid gap-2">
          {active.map((e) => (
            <li key={e.id} className="flex items-center justify-between gap-2 text-sm">
              <span>
                {name(e)}
                {e.discountPct > 0 && (
                  <span className="ms-2 text-muted-foreground">
                    {t('enrollments.discountShort', { pct: e.discountPct })}
                  </span>
                )}
              </span>
              <LeaveMenu
                busy={left.isLoading}
                onLeave={() => void leave({ id: studentId, enrollmentId: e.id })}
              />
            </li>
          ))}
        </ul>
        {adding ? (
          <>
            <SelectField
              label={t('enrollments.group')}
              value={groupId}
              onChange={(ev) => setGroupId(ev.target.value)}
            >
              <option value="">{t('form.choose')}</option>
              {groups.data
                ?.filter((g) => g.status === 'active' && !active.some((e) => e.groupId === g.id))
                .map((g) => (
                  <option key={g.id} value={g.id}>
                    {groupName(g, i18n.language, true)}
                  </option>
                ))}
            </SelectField>
            <Field
              label={`${t('enrollments.discount')} ${t('form.optional')}`}
              inputMode="numeric"
              dir="ltr"
              value={discount}
              onChange={(ev) => setDiscount(ev.target.value.replace(/\D/g, '').slice(0, 3))}
              error={pct > 100 ? t('form.invalid.discount') : undefined}
            />
            {full ? (
              <GroupFullConfirm
                full={full}
                busy={enrolled.isLoading}
                onConfirm={() => void onAdd(true)}
                onCancel={() => enrolled.reset()}
              />
            ) : (
              <>
                <FormError
                  message={
                    (enrolled.error ?? left.error) && t(errorKey(enrolled.error ?? left.error))
                  }
                />
                <Button
                  type="button"
                  disabled={!groupId || pct > 100 || enrolled.isLoading}
                  onClick={() => void onAdd()}
                >
                  {t('enrollments.add')}
                </Button>
              </>
            )}
          </>
        ) : (
          <Button type="button" variant="outline" onClick={() => setAdding(true)}>
            {t('enrollments.open')}
          </Button>
        )}
      </CardContent>
    </Card>
  );
}

/** App access: hand out an activation link, or reset the bound phone. */
export function AppAccess({ student }: { student: Student }) {
  const { t } = useTranslation();
  const [invite, invited] = useCreateStudentInviteMutation();
  const [reset, wasReset] = useResetStudentDeviceMutation();
  const [confirming, setConfirming] = useState(false);
  const link = invited.data && `${window.location.origin}/s/activate/${invited.data.token}`;

  const status = !student.activated
    ? t('studentApp.staff.notActivated')
    : student.deviceBound
      ? t('studentApp.staff.bound')
      : t('studentApp.staff.noPhone');

  return (
    <Card>
      <CardHeader>
        <CardTitle>
          <h2>{t('studentApp.staff.title')}</h2>
        </CardTitle>
      </CardHeader>
      <CardContent className="grid gap-3">
        <p role="status" className="text-sm">
          {status}
        </p>
        {!student.activated && (
          <Button
            type="button"
            variant="outline"
            disabled={invited.isLoading}
            onClick={() => void invite({ id: student.id })}
          >
            {t('studentApp.staff.invite')}
          </Button>
        )}
        {link && (
          <div className="grid gap-2 rounded-md border p-3 text-sm">
            <p>{t('studentApp.staff.linkHint')}</p>
            <bdi className="break-all font-mono text-xs" dir="ltr" data-testid="invite-link">
              {link}
            </bdi>
            <ShareButton text={t('share.studentInvite')} url={link} />
          </div>
        )}
        {student.deviceBound && (
          <Button
            type="button"
            variant={confirming ? 'destructive' : 'outline'}
            disabled={wasReset.isLoading}
            onClick={() => {
              if (!confirming) return setConfirming(true);
              setConfirming(false);
              void reset({ id: student.id });
            }}
          >
            {t(confirming ? 'studentApp.staff.resetConfirm' : 'studentApp.staff.reset')}
          </Button>
        )}
        <FormError
          message={
            (invited.error ?? wasReset.error) && t(errorKey(invited.error ?? wasReset.error))
          }
        />
      </CardContent>
    </Card>
  );
}

/**
 * «إخراج من المجموعة» waits behind a «⋯» and a second tap, so it is never a stray tap next
 * to the group's name (audit 3 S7).
 */
function LeaveMenu({ busy, onLeave }: { busy: boolean; onLeave: () => void }) {
  const { t } = useTranslation();
  const [open, setOpen] = useState(false);
  const [confirming, setConfirming] = useState(false);
  return (
    <span className="flex shrink-0 items-center gap-1">
      {open && (
        <Button
          size="sm"
          variant={confirming ? 'destructive' : 'ghost'}
          disabled={busy}
          onClick={() => (confirming ? onLeave() : setConfirming(true))}
        >
          {t(confirming ? 'enrollments.confirmLeave' : 'enrollments.leave')}
        </Button>
      )}
      <Button
        size="icon-sm"
        variant="ghost"
        aria-label={t('enrollments.actions')}
        aria-expanded={open}
        onClick={() => {
          setOpen(!open);
          setConfirming(false);
        }}
      >
        <MoreHorizontal aria-hidden />
      </Button>
    </span>
  );
}
