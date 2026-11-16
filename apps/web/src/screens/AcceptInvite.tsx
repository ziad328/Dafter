import { MailOpen } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { Link, useParams } from 'react-router';
import { useAcceptInviteMutation, useGetInvitePreviewQuery, useGetMeQuery } from '@/api/generated';
import { FormError, Skeleton } from '@/components/Field';
import { IconBadge } from '@/components/Page';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { errorKey, useSelectWorkspace, workspaceName } from '@/lib/session';

export default function AcceptInvite() {
  const { t, i18n } = useTranslation();
  const { token = '' } = useParams();
  const me = useGetMeQuery();
  // Who invites, and as what: «سنتر النور يدعوك كمساعد» (audit 3 A10).
  const preview = useGetInvitePreviewQuery({ token });
  const [accept, { error, isLoading }] = useAcceptInviteMutation();
  const select = useSelectWorkspace();
  const here = encodeURIComponent(`/invite/${token}`);

  if (me.isLoading || preview.isLoading) return <Skeleton />;
  if (preview.error)
    return (
      <Card>
        <CardHeader>
          <IconBadge icon={MailOpen} />
          <CardTitle>
            <h1>{t('invite.title')}</h1>
          </CardTitle>
        </CardHeader>
        <CardContent>
          <FormError message={t(errorKey(preview.error))} />
        </CardContent>
      </Card>
    );
  const p = preview.data!;
  const center = workspaceName(
    { nameAr: p.workspaceNameAr, nameEn: p.workspaceNameEn },
    i18n.language,
  );

  return (
    <Card>
      <CardHeader>
        <IconBadge icon={MailOpen} />
        <CardTitle>
          <h1>{t('invite.invites', { center, role: t(`invite.as.${p.role}`) })}</h1>
        </CardTitle>
        <CardDescription>{me.data ? t('invite.body') : t('invite.signInFirst')}</CardDescription>
      </CardHeader>
      <CardContent className="grid gap-4">
        {me.data ? (
          <>
            <FormError message={error && t(errorKey(error))} />
            <Button
              disabled={isLoading}
              onClick={async () => {
                const joined = await accept({ token });
                if (joined.data) select(joined.data.id);
              }}
            >
              {t('invite.join')}
            </Button>
          </>
        ) : (
          <>
            <Button asChild>
              <Link to={`/login?next=${here}`}>{t('auth.login.submit')}</Link>
            </Button>
            <Button asChild variant="outline">
              <Link to={`/register?next=${here}`}>{t('auth.register.submit')}</Link>
            </Button>
          </>
        )}
      </CardContent>
    </Card>
  );
}
