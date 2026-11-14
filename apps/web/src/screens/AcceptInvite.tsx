import { MailOpen } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { Link, useParams } from 'react-router';
import { useAcceptInviteMutation, useGetMeQuery } from '@/api/generated';
import { FormError, Skeleton } from '@/components/Field';
import { IconBadge } from '@/components/Page';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { errorKey, useSelectWorkspace } from '@/lib/session';

export default function AcceptInvite() {
  const { t } = useTranslation();
  const { token = '' } = useParams();
  const me = useGetMeQuery();
  const [accept, { error, isLoading }] = useAcceptInviteMutation();
  const select = useSelectWorkspace();
  const here = encodeURIComponent(`/invite/${token}`);

  if (me.isLoading) return <Skeleton />;

  return (
    <Card>
      <CardHeader>
        <IconBadge icon={MailOpen} />
        <CardTitle>
          <h1>{t('invite.title')}</h1>
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
