import { UserPlus } from 'lucide-react';
import { registerRequest, type RegisterRequest } from '@dafter/contracts';
import { isLocale } from '@dafter/i18n';
import { zodResolver } from '@hookform/resolvers/zod';
import { useForm } from 'react-hook-form';
import { useTranslation } from 'react-i18next';
import { Link, useNavigate, useSearchParams } from 'react-router';
import { useRegisterMutation } from '@/api/generated';
import { Field, FormError } from '@/components/Field';
import { IconBadge } from '@/components/Page';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardFooter, CardHeader, CardTitle } from '@/components/ui/card';
import { errorText, safeNext } from '@/lib/session';

// Empty optional inputs must be undefined, or the email/phone rules reject "".
const optional = { setValueAs: (v: string) => v.trim() || undefined };

export default function Register() {
  const { t, i18n } = useTranslation();
  const navigate = useNavigate();
  const [params] = useSearchParams();
  const next = safeNext(params.get('next'));
  const [signUp, { error, isLoading }] = useRegisterMutation();
  const { register, handleSubmit, formState } = useForm<RegisterRequest>({
    resolver: zodResolver(registerRequest),
  });
  const errors = formState.errors;

  const onSubmit = handleSubmit(async (body) => {
    const locale = isLocale(i18n.language) ? i18n.language : undefined;
    if ((await signUp({ registerRequest: { ...body, locale } })).data) void navigate(next);
  });

  return (
    <Card>
      <CardHeader>
        <IconBadge icon={UserPlus} />
        <CardTitle>
          <h1>{t('auth.register.title')}</h1>
        </CardTitle>
      </CardHeader>
      <form onSubmit={onSubmit} noValidate>
        <CardContent className="grid gap-4">
          <Field
            label={t('auth.register.name')}
            autoComplete="name"
            error={errors.name && t('form.invalid.name')}
            {...register('name')}
          />
          <Field
            label={t('auth.register.phone')}
            type="tel"
            inputMode="tel"
            dir="ltr"
            autoComplete="tel-national"
            error={errors.phone && t('form.invalid.phone')}
            {...register('phone', optional)}
          />
          <Field
            label={`${t('auth.register.email')} ${t('form.optional')}`}
            type="email"
            dir="ltr"
            autoComplete="email"
            // Password reset goes by email only, so say what it is for (audit 3 A5).
            hint={t('auth.register.emailHint')}
            error={errors.email && t('form.invalid.email')}
            {...register('email', optional)}
          />
          <Field
            label={t('auth.register.password')}
            type="password"
            autoComplete="new-password"
            hint={t('auth.register.passwordHint')}
            error={errors.password && t('form.invalid.password')}
            {...register('password')}
          />
          <FormError message={error && errorText(t, error)} />
          <Button type="submit" disabled={isLoading}>
            {t('auth.register.submit')}
          </Button>
        </CardContent>
      </form>
      <CardFooter className="mt-6 gap-1 text-sm">
        {t('auth.register.haveAccount')}
        <Link className="underline" to={`/login?next=${encodeURIComponent(next)}`}>
          {t('auth.register.login')}
        </Link>
      </CardFooter>
    </Card>
  );
}
