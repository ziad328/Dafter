import { type Member, normalizeArabic } from '@dafter/contracts';
import { MoreHorizontal, UserPlus } from 'lucide-react';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useNavigate } from 'react-router';
import {
  useCreateInviteMutation,
  useListInvitesQuery,
  useRevokeInviteMutation,
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
import { setWorkspaceId } from '@/api/base';
import { errorDetails, errorKey } from '@/lib/session';
import { intlLocale } from '@/lib/time';

/** Staff of the workspace; the owner invites teachers and assistants and picks assistants' teachers. */
export default function Members() {
  const { t } = useTranslation();
  const isOwner = useGetCurrentWorkspaceQuery().data?.role === 'owner';
  const members = useListMembersQuery();
  const [q, setQ] = useState('');
  const [inviting, setInviting] = useState(false);
  if (members.isLoading) return <Skeleton />;
  const all = members.data ?? [];
  const teachers = all.filter((m) => m.role !== 'assistant');
  const needle = normalizeArabic(q.trim());
  const shown = needle
    ? all.filter((m) => normalizeArabic(`${m.name} ${m.phone ?? ''}`).includes(needle))
    : all;

  return (
    <div className="grid gap-5">
      {/* The invite form waits behind a button, so the team list opens first (audit 3 R1). */}
      <PageHeader
        title={t('members.title')}
        action={
          isOwner && (
            <Button onClick={() => setInviting(true)}>
              <UserPlus aria-hidden />
              {t('members.inviteShort')}
            </Button>
          )
        }
      />
      <Sheet open={inviting} onClose={() => setInviting(false)} title={t('members.invite')}>
        <InviteForm teachers={teachers} />
      </Sheet>
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
      {isOwner && <PendingInvites />}
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

/** Invites nobody has accepted yet, each with a revoke; hidden when there are none. */
function PendingInvites() {
  const { t, i18n } = useTranslation();
  const list = useListInvitesQuery();
  const [revoke, revoking] = useRevokeInviteMutation();
  if (!list.data?.length) return null;
  return (
    <section aria-labelledby="pending-invites" className="grid gap-2">
      <h2 id="pending-invites" className="font-semibold">
        {t('members.pending')}
      </h2>
      <Panel className="overflow-hidden">
        <ul className="divide-y">
          {list.data.map((inv) => (
            <li key={inv.id} className="flex items-center justify-between gap-3 px-4 py-2.5">
              <span className="grid">
                <span className="font-medium">{t(`roles.${inv.role}`)}</span>
                <span className="text-xs text-muted-foreground">
                  {t('members.expires', {
                    when: new Intl.DateTimeFormat(intlLocale(i18n.language), {
                      weekday: 'long',
                      hour: 'numeric',
                      minute: '2-digit',
                    }).format(Date.parse(inv.expiresAt)),
                  })}
                </span>
              </span>
              <Button
                size="sm"
                variant="ghost"
                disabled={revoking.isLoading}
                onClick={() => void revoke({ id: inv.id })}
              >
                {t('members.revoke')}
              </Button>
            </li>
          ))}
        </ul>
      </Panel>
      <FormError message={revoking.error && t(errorKey(revoking.error))} />
    </section>
  );
}

/** A one-time link; an assistant's link can carry the teachers they will work for. */
function InviteForm({ teachers }: { teachers: Member[] }) {
  const { t } = useTranslation();
  const [role, setRole] = useState<'teacher' | 'assistant'>('assistant');
  const [ids, setIds] = useState<string[]>([]);
  const [create, created] = useCreateInviteMutation();
  const link = created.data && `${location.origin}/invite/${created.data.token}`;
  return (
    <div className="grid gap-3">
      <p className="text-sm text-muted-foreground">{t('members.inviteHint')}</p>
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
          {/* Send or Copy only: a 70-character link on screen helps nobody (audit 3 A13). */}
          <div data-testid="staff-invite-link" data-link={link}>
            <ShareButton text={t('share.staffInvite')} url={link} />
          </div>
        </div>
      )}
    </div>
  );
}

/**
 * The owner makes a one-time password link for someone who forgot theirs (no email needed). The
 * API refuses accounts used in another workspace, and the sheet shows that error.
 */
function ResetLink({ member: m, onClose }: { member: Member; onClose: () => void }) {
  const { t } = useTranslation();
  const [create, created] = useCreateStaffResetLinkMutation();
  const link = created.data && `${location.origin}/reset/${created.data.token}`;
  return (
    <Sheet open onClose={onClose} title={t('members.resetFor', { name: m.name })}>
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
  );
}

type Item = 'scopes' | 'reset' | 'manage';

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
  // The row's actions wait behind «⋯» as words, not bare icons (audit 3 R2).
  const [menu, setMenu] = useState(false);
  const [sheet, setSheet] = useState<Item>();
  const items = [
    m.role === 'assistant' && 'scopes',
    m.role !== 'owner' && 'reset',
    'manage',
  ].filter(Boolean) as Item[];
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
    <div className="flex flex-wrap items-center gap-3 px-4 py-3">
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
      {canEdit && (
        <Button
          size="icon-sm"
          variant="ghost"
          aria-label={t('members.actions', { name: m.name })}
          aria-expanded={menu}
          onClick={() => setMenu(!menu)}
        >
          <MoreHorizontal aria-hidden />
        </Button>
      )}
      {menu && (
        <div className="flex basis-full flex-wrap justify-end gap-1">
          {items.map((item) => (
            <Button
              key={item}
              size="sm"
              variant="outline"
              onClick={() => {
                setMenu(false);
                setSheet(item);
              }}
            >
              {t(`members.menu.${item}`)}
            </Button>
          ))}
        </div>
      )}
      {sheet === 'reset' && <ResetLink member={m} onClose={() => setSheet(undefined)} />}
      {sheet === 'manage' && <ManageMember member={m} onClose={() => setSheet(undefined)} />}
      <Sheet
        open={sheet === 'scopes'}
        onClose={() => setSheet(undefined)}
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
function ManageMember({ member: m, onClose }: { member: Member; onClose: () => void }) {
  const { t } = useTranslation();
  const [role, setRole] = useState(m.role);
  const [confirm, setConfirm] = useState(false);
  const [update, updated] = useUpdateMemberMutation();
  const navigate = useNavigate();
  const isMe = useGetMeQuery().data?.id === m.userId;
  const teaching = errorDetails(updated.error, 'MEMBER_TEACHES_GROUPS');
  const save = async (body: { role: Member['role'] } | { status: 'removed' }) => {
    const res = await update({ id: m.id, updateMemberRequest: body });
    if (!res.data) return;
    onClose();
    // Removed themselves (another owner stays): this center is gone for them.
    if (isMe && 'status' in body) {
      setWorkspaceId(null);
      void navigate('/workspaces', { replace: true });
    }
  };
  // Mounted while open, so each opening starts from the saved role.
  return (
    <Sheet open onClose={onClose} title={t('members.manage', { name: m.name })}>
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
  );
}
