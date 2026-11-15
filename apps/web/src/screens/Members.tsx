import { type Member, normalizeArabic } from '@dafter/contracts';
import { KeyRound, UserCog } from 'lucide-react';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useNavigate } from 'react-router';
import {
  useCreateInviteMutation,
  useCreateStaffResetLinkMutation,
  useGetCurrentWorkspaceQuery,
  useGetMeQuery,
  useListMembersQuery,
  useSetAssistantScopesMutation,
  useUpdateMemberMutation,
} from '@/api/generated';
import { FormError, SelectField, Skeleton } from '@/components/Field';
import { ShareButton } from '@/components/ShareButton';
import { Avatar, PageHeader, Panel, Sheet } from '@/components/Page';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { setWorkspaceId } from '@/api/base';
import { errorDetails, errorKey } from '@/lib/session';

/** Staff of the workspace; the owner invites teachers and assistants and picks assistants' teachers. */
export default function Members() {
  const { t } = useTranslation();
  const isOwner = useGetCurrentWorkspaceQuery().data?.role === 'owner';
  const members = useListMembersQuery();
  const [q, setQ] = useState('');
  if (members.isLoading) return <Skeleton />;
  const all = members.data ?? [];
  const teachers = all.filter((m) => m.role !== 'assistant');
  const needle = normalizeArabic(q.trim());
  const shown = needle
    ? all.filter((m) => normalizeArabic(`${m.name} ${m.phone ?? ''}`).includes(needle))
    : all;

  return (
    <div className="grid gap-5">
      <PageHeader title={t('members.title')} />
      {isOwner && <InviteCard teachers={teachers} />}
      <FormError message={members.error && t(errorKey(members.error))} />
      {/* A search once the team outgrows one screen (audit MB1). */}
      {all.length > 10 && (
        <input
          type="search"
          aria-label={t('members.search')}
          placeholder={t('members.search')}
          value={q}
          onChange={(e) => setQ(e.target.value)}
          className="h-11 w-full rounded-2xl border bg-card px-4 text-base shadow-card outline-none focus-visible:ring-2 focus-visible:ring-ring"
        />
      )}
      <Panel className="overflow-hidden">
        <ul className="divide-y">
          {shown.map((m) => (
            <li key={m.id}>
              <MemberRow member={m} teachers={teachers} canEdit={isOwner} />
            </li>
          ))}
        </ul>
      </Panel>
    </div>
  );
}

/** A one-time link; an assistant's link can carry the teachers they will work for. */
function InviteCard({ teachers }: { teachers: Member[] }) {
  const { t } = useTranslation();
  const [role, setRole] = useState<'teacher' | 'assistant'>('assistant');
  const [ids, setIds] = useState<string[]>([]);
  const [create, created] = useCreateInviteMutation();
  const link = created.data && `${location.origin}/invite/${created.data.token}`;
  return (
    <Card>
      <CardHeader>
        <CardTitle>
          <h2>{t('members.invite')}</h2>
        </CardTitle>
        <CardDescription>{t('members.inviteHint')}</CardDescription>
      </CardHeader>
      <CardContent className="grid gap-3">
        <SelectField
          label={t('members.role')}
          value={role}
          onChange={(e) => setRole(e.target.value as typeof role)}
        >
          <option value="assistant">{t('roles.assistant')}</option>
          <option value="teacher">{t('roles.teacher')}</option>
        </SelectField>
        {role === 'assistant' && teachers.length > 0 && (
          <fieldset className="grid gap-1">
            <legend className="mb-1 text-sm font-medium">{t('members.inviteWorksFor')}</legend>
            {teachers.map((teacher) => (
              <label key={teacher.id} className="flex min-h-10 items-center gap-2 text-sm">
                <input
                  type="checkbox"
                  className="size-4"
                  checked={ids.includes(teacher.id)}
                  onChange={(e) =>
                    setIds(
                      e.target.checked ? [...ids, teacher.id] : ids.filter((x) => x !== teacher.id),
                    )
                  }
                />
                {teacher.name}
              </label>
            ))}
          </fieldset>
        )}
        <Button
          type="button"
          disabled={created.isLoading}
          onClick={() =>
            void create({
              createInviteRequest: {
                role,
                teacherMembershipIds: role === 'assistant' ? ids : undefined,
              },
            })
          }
        >
          {t('members.createLink')}
        </Button>
        <FormError message={created.error && t(errorKey(created.error))} />
        {link && (
          <div className="grid gap-2 rounded-md border p-3 text-sm">
            <p>{t('members.linkHint', { role: t(`roles.${created.data!.role}`) })}</p>
            <bdi className="break-all font-mono text-xs" dir="ltr" data-testid="staff-invite-link">
              {link}
            </bdi>
            <ShareButton text={t('share.staffInvite')} url={link} />
          </div>
        )}
      </CardContent>
    </Card>
  );
}

/**
 * The owner makes a one-time password link for someone who forgot theirs (no email needed). The
 * API refuses accounts used in another workspace, and the sheet shows that error.
 */
function ResetLink({ member: m }: { member: Member }) {
  const { t } = useTranslation();
  const [open, setOpen] = useState(false);
  const [create, created] = useCreateStaffResetLinkMutation();
  const link = created.data && `${location.origin}/reset/${created.data.token}`;
  return (
    <>
      <Button
        size="icon"
        variant="outline"
        aria-label={t('members.resetFor', { name: m.name })}
        onClick={() => setOpen(true)}
      >
        <KeyRound className="size-4" aria-hidden />
      </Button>
      <Sheet
        open={open}
        onClose={() => setOpen(false)}
        title={t('members.resetFor', { name: m.name })}
      >
        <div className="grid gap-3 text-sm">
          <p className="text-muted-foreground">{t('members.resetHint')}</p>
          <Button
            type="button"
            disabled={created.isLoading}
            onClick={() => void create({ id: m.id })}
          >
            {t('members.createResetLink')}
          </Button>
          <FormError message={created.error && t(errorKey(created.error))} />
          {link && (
            <div className="grid gap-2 rounded-md border p-3">
              <bdi className="break-all font-mono text-xs" dir="ltr" data-testid="staff-reset-link">
                {link}
              </bdi>
              <ShareButton text={t('share.staffReset')} url={link} />
            </div>
          )}
        </div>
      </Sheet>
    </>
  );
}

/** One line per person; an assistant's teachers are named here and edited in a sheet. */
function MemberRow({
  member: m,
  teachers,
  canEdit,
}: {
  member: Member;
  teachers: Member[];
  canEdit: boolean;
}) {
  const { t, i18n } = useTranslation();
  const [setScopes, saving] = useSetAssistantScopesMutation();
  const [editing, setEditing] = useState(false);
  // Optimistic, so the box ticks at once; a failed save puts it back.
  const [ids, setIds] = useState(m.teacherMembershipIds);
  const toggle = async (teacherId: string, on: boolean) => {
    const next = on ? [...ids, teacherId] : ids.filter((x) => x !== teacherId);
    setIds(next);
    const res = await setScopes({ id: m.id, setScopesRequest: { teacherMembershipIds: next } });
    if (res.error) setIds(ids);
  };
  const worksFor = teachers.filter((x) => ids.includes(x.id)).map((x) => x.name);
  return (
    <div className="flex items-center gap-3 px-4 py-3">
      <Avatar name={m.name} />
      <div className="grid min-w-0 flex-1">
        <h3 className="truncate font-semibold">{m.name}</h3>
        <p className="truncate text-sm text-muted-foreground">
          {t(`roles.${m.role}`)}
          {m.phone && (
            <>
              {' · '}
              <bdi>{m.phone}</bdi>
            </>
          )}
        </p>
        {m.role === 'assistant' && (
          <p className="truncate text-sm">
            {worksFor.length
              ? t('members.worksForList', {
                  names: new Intl.ListFormat(i18n.language).format(worksFor),
                })
              : t('members.worksForNone')}
          </p>
        )}
      </div>
      {m.role === 'assistant' && canEdit && (
        <Button
          size="sm"
          variant="outline"
          aria-label={t('members.editScopes', { name: m.name })}
          onClick={() => setEditing(true)}
        >
          {t('members.edit')}
        </Button>
      )}
      {m.role !== 'owner' && canEdit && <ResetLink member={m} />}
      {canEdit && <ManageMember member={m} />}
      <Sheet
        open={editing}
        onClose={() => setEditing(false)}
        title={t('members.editScopes', { name: m.name })}
      >
        <div className="grid gap-2">
          <p className="text-sm font-medium">{t('members.worksFor')}</p>
          {teachers.map((teacher) => (
            <label key={teacher.id} className="flex min-h-10 items-center gap-2 text-sm">
              <input
                type="checkbox"
                className="size-4"
                checked={ids.includes(teacher.id)}
                onChange={(e) => void toggle(teacher.id, e.target.checked)}
              />
              {teacher.name}
            </label>
          ))}
          <FormError message={saving.error && t(errorKey(saving.error))} />
        </div>
      </Sheet>
    </div>
  );
}

/**
 * The owner changes someone's role or removes them (a second tap confirms). Removing keeps their
 * groups, flagged on the groups screen until another teacher takes them.
 */
function ManageMember({ member: m }: { member: Member }) {
  const { t } = useTranslation();
  const [open, setOpen] = useState(false);
  const [role, setRole] = useState(m.role);
  const [confirm, setConfirm] = useState(false);
  const [update, updated] = useUpdateMemberMutation();
  const navigate = useNavigate();
  const isMe = useGetMeQuery().data?.id === m.userId;
  const teaching = errorDetails(updated.error, 'MEMBER_TEACHES_GROUPS');
  const save = async (body: { role: Member['role'] } | { status: 'removed' }) => {
    const res = await update({ id: m.id, updateMemberRequest: body });
    if (!res.data) return;
    setOpen(false);
    // Removed themselves (another owner stays): this center is gone for them.
    if (isMe && 'status' in body) {
      setWorkspaceId(null);
      void navigate('/workspaces', { replace: true });
    }
  };
  return (
    <>
      <Button
        size="icon"
        variant="outline"
        aria-label={t('members.manage', { name: m.name })}
        onClick={() => {
          setRole(m.role);
          setConfirm(false);
          updated.reset();
          setOpen(true);
        }}
      >
        <UserCog className="size-4" aria-hidden />
      </Button>
      <Sheet
        open={open}
        onClose={() => setOpen(false)}
        title={t('members.manage', { name: m.name })}
      >
        <div className="grid gap-3 text-sm">
          <SelectField
            label={t('members.role')}
            value={role}
            onChange={(e) => setRole(e.target.value as Member['role'])}
          >
            <option value="owner">{t('roles.owner')}</option>
            <option value="teacher">{t('roles.teacher')}</option>
            <option value="assistant">{t('roles.assistant')}</option>
          </SelectField>
          <Button
            type="button"
            disabled={role === m.role || updated.isLoading}
            onClick={() => void save({ role })}
          >
            {t('members.saveRole')}
          </Button>
          {confirm ? (
            <div className="grid gap-2 rounded-md border border-rose/40 bg-rose-soft p-3">
              <p>{t('members.removeHint', { name: m.name })}</p>
              <Button
                type="button"
                variant="destructive"
                disabled={updated.isLoading}
                onClick={() => void save({ status: 'removed' })}
              >
                {t('members.confirmRemove')}
              </Button>
            </div>
          ) : (
            <Button type="button" variant="outline" onClick={() => setConfirm(true)}>
              {t('members.remove')}
            </Button>
          )}
          <FormError
            message={
              teaching
                ? t('members.teachesGroups', { count: Number(teaching.count) })
                : updated.error && t(errorKey(updated.error))
            }
          />
        </div>
      </Sheet>
    </>
  );
}
