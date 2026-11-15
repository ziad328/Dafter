import { LogIn } from 'lucide-react';
import { loginRequest, type LoginRequest } from '@dafter/contracts';
import { zodResolver } from '@hookform/resolvers/zod';
import { useForm } from 'react-hook-form';
import { useTranslation } from 'react-i18next';
import { Link, useNavigate, useSearchParams } from 'react-router';
import { useLoginMutation } from '@/api/generated';
import { Field, FormError } from '@/components/Field';
import { IconBadge } from '@/components/Page';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardFooter, CardHeader, CardTitle } from '@/components/ui/card';
import { errorKey, safeNext } from '@/lib/session';

export default function Login() {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const [params] = useSearchParams();
  const next = safeNext(params.get('next'));
  const [login, { error, isLoading }] = useLoginMutation();
  const { register, handleSubmit, formState } = useForm<LoginRequest>({
    resolver: zodResolver(loginRequest),
  });

  const onSubmit = handleSubmit(async (body) => {
    if ((await login({ loginRequest: body })).data) void navigate(next);
  });

  return (
    <Card>
      <CardHeader>
        <IconBadge icon={LogIn} />
        <CardTitle>
          <h1>{t('auth.login.title')}</h1>
        </CardTitle>
      </CardHeader>
      <form onSubmit={onSubmit} noValidate>
        <CardContent className="grid gap-4">
          <Field
            label={t('auth.login.login')}
            dir="ltr"
            autoComplete="username"
            error={formState.errors.login && t('form.invalid.login')}
            {...register('login')}
          />
          <Field
            label={t('auth.login.password')}
            type="password"
            autoComplete="current-password"
            error={formState.errors.password && t('form.invalid.passwordRequired')}
            {...register('password')}
          />
          <FormError message={error && t(errorKey(error))} />
          <Button type="submit" disabled={isLoading}>
            {t('auth.login.submit')}
          </Button>
          <Link className="justify-self-start text-sm underline" to="/forgot">
            {t('auth.login.forgot')}
          </Link>
        </CardContent>
      </form>
      <CardFooter className="mt-6 gap-1 text-sm">
        {t('auth.login.noAccount')}
        <Link className="underline" to={`/register?next=${encodeURIComponent(next)}`}>
          {t('auth.login.register')}
        </Link>
      </CardFooter>
    </Card>
  );
}
