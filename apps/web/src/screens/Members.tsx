import type { Member } from '@dafter/contracts';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import {
  useCreateInviteMutation,
  useGetCurrentWorkspaceQuery,
  useListMembersQuery,
  useSetAssistantScopesMutation,
} from '@/api/generated';
import { FormError, SelectField, Skeleton } from '@/components/Field';
import { ShareButton } from '@/components/ShareButton';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { errorKey } from '@/lib/session';

/** Staff of the workspace; the owner invites teachers and assistants and picks assistants' teachers. */
export default function Members() {
  const { t } = useTranslation();
  const isOwner = useGetCurrentWorkspaceQuery().data?.role === 'owner';
  const members = useListMembersQuery();
  if (members.isLoading) return <Skeleton />;
  const teachers = (members.data ?? []).filter((m) => m.role !== 'assistant');

  return (
    <div className="grid gap-4">
      <h1 className="text-xl font-bold">{t('members.title')}</h1>
      {isOwner && <InviteCard />}
      <FormError message={members.error && t(errorKey(members.error))} />
      <ul className="grid gap-2">
        {members.data?.map((m) => (
          <li key={m.id}>
            <MemberCard member={m} teachers={teachers} canEdit={isOwner} />
          </li>
        ))}
      </ul>
    </div>
  );
}

function InviteCard() {
  const { t } = useTranslation();
  const [role, setRole] = useState<'teacher' | 'assistant'>('assistant');
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
        <Button
          type="button"
          disabled={created.isLoading}
          onClick={() => void create({ createInviteRequest: { role } })}
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

function MemberCard({
  member: m,
  teachers,
  canEdit,
}: {
  member: Member;
  teachers: Member[];
  canEdit: boolean;
}) {
  const { t } = useTranslation();
  const [setScopes, saving] = useSetAssistantScopesMutation();
  // Optimistic, so the box ticks at once; a failed save puts it back.
  const [ids, setIds] = useState(m.teacherMembershipIds);
  const toggle = async (teacherId: string, on: boolean) => {
    const next = on ? [...ids, teacherId] : ids.filter((x) => x !== teacherId);
    setIds(next);
    const res = await setScopes({ id: m.id, setScopesRequest: { teacherMembershipIds: next } });
    if (res.error) setIds(ids);
  };
  return (
    <Card className="gap-2 py-4">
      <CardHeader className="px-4">
        <CardTitle className="flex flex-wrap items-baseline justify-between gap-2">
          <h3>{m.name}</h3>
          <span className="text-sm font-normal text-muted-foreground">{t(`roles.${m.role}`)}</span>
        </CardTitle>
        {m.phone && (
          <CardDescription>
            <bdi>{m.phone}</bdi>
          </CardDescription>
        )}
      </CardHeader>
      {m.role === 'assistant' && (
        <CardContent className="grid gap-2 px-4">
          <p className="text-sm font-medium">{t('members.worksFor')}</p>
          {teachers.map((teacher) => (
            <label key={teacher.id} className="flex min-h-9 items-center gap-2 text-sm">
              <input
                type="checkbox"
                className="size-4"
                disabled={!canEdit}
                checked={ids.includes(teacher.id)}
                onChange={(e) => void toggle(teacher.id, e.target.checked)}
              />
              {teacher.name}
            </label>
          ))}
          <FormError message={saving.error && t(errorKey(saving.error))} />
        </CardContent>
      )}
    </Card>
  );
}
