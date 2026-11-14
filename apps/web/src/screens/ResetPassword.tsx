import { KeyRound } from 'lucide-react';
import { resetPasswordRequest } from '@dafter/contracts';
import { zodResolver } from '@hookform/resolvers/zod';
import { useForm } from 'react-hook-form';
import { useTranslation } from 'react-i18next';
import { Link, useParams } from 'react-router';
import { useResetPasswordMutation } from '@/api/generated';
import { Field, FormError } from '@/components/Field';
import { IconBadge } from '@/components/Page';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardFooter, CardHeader, CardTitle } from '@/components/ui/card';
import { errorKey } from '@/lib/session';

const form = resetPasswordRequest.pick({ password: true });

export default function ResetPassword() {
  const { t } = useTranslation();
  const { token = '' } = useParams();
  const [reset, { error, isLoading, isSuccess }] = useResetPasswordMutation();
  const { register, handleSubmit, formState } = useForm<{ password: string }>({
    resolver: zodResolver(form),
  });

  const onSubmit = handleSubmit(({ password }) =>
    reset({ resetPasswordRequest: { token, password } }),
  );

  return (
    <Card>
      <CardHeader>
        <IconBadge icon={KeyRound} />
        <CardTitle>
          <h1>{t('auth.reset.title')}</h1>
        </CardTitle>
      </CardHeader>
      {isSuccess ? (
        <CardContent>
          <p role="status">{t('auth.reset.done')}</p>
        </CardContent>
      ) : (
        <form onSubmit={onSubmit} noValidate>
          <CardContent className="grid gap-4">
            <Field
              label={t('auth.reset.password')}
              type="password"
              autoComplete="new-password"
              hint={t('auth.register.passwordHint')}
              error={formState.errors.password && t('form.invalid.password')}
              {...register('password')}
            />
            <FormError message={error && t(errorKey(error))} />
            <Button type="submit" disabled={isLoading}>
              {t('auth.reset.submit')}
            </Button>
          </CardContent>
        </form>
      )}
      <CardFooter className="mt-6 text-sm">
        {error ? (
          <Link className="underline" to="/forgot">
            {t('auth.reset.again')}
          </Link>
        ) : (
          <Link className="underline" to="/login">
            {t('auth.forgot.back')}
          </Link>
        )}
      </CardFooter>
    </Card>
  );
}
