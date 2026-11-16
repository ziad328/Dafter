import { KeyRound } from 'lucide-react';
import { forgotPasswordRequest, type ForgotPasswordRequest } from '@dafter/contracts';
import { zodResolver } from '@hookform/resolvers/zod';
import { useForm } from 'react-hook-form';
import { useTranslation } from 'react-i18next';
import { Link } from 'react-router';
import { useForgotPasswordMutation } from '@/api/generated';
import { Field, FormError } from '@/components/Field';
import { IconBadge } from '@/components/Page';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardFooter, CardHeader, CardTitle } from '@/components/ui/card';
import { errorText } from '@/lib/session';

export default function ForgotPassword() {
  const { t } = useTranslation();
  const [request, { error, isLoading, isSuccess }] = useForgotPasswordMutation();
  const { register, handleSubmit, formState } = useForm<ForgotPasswordRequest>({
    resolver: zodResolver(forgotPasswordRequest),
  });

  const onSubmit = handleSubmit((body) => request({ forgotPasswordRequest: body }));

  return (
    <Card>
      <CardHeader>
        <IconBadge icon={KeyRound} />
        <CardTitle>
          <h1>{t('auth.forgot.title')}</h1>
        </CardTitle>
      </CardHeader>
      {isSuccess ? (
        <CardContent>
          <p role="status">{t('auth.forgot.sent')}</p>
        </CardContent>
      ) : (
        <form onSubmit={onSubmit} noValidate>
          <CardContent className="grid gap-4">
            <p className="text-sm text-muted-foreground">{t('auth.forgot.body')}</p>
            <Field
              label={t('auth.forgot.email')}
              type="email"
              dir="ltr"
              autoComplete="email"
              error={formState.errors.email && t('form.invalid.email')}
              {...register('email')}
            />
            <FormError message={error && errorText(t, error)} />
            <Button type="submit" disabled={isLoading}>
              {t('auth.forgot.submit')}
            </Button>
          </CardContent>
        </form>
      )}
      <CardFooter className="mt-6 text-sm">
        <Link className="underline" to="/login">
          {t('auth.forgot.back')}
        </Link>
      </CardFooter>
    </Card>
  );
}
