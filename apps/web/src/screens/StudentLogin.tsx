import { normalizeArabic, otpRequest, otpVerifyRequest } from '@dafter/contracts';
import { zodResolver } from '@hookform/resolvers/zod';
import { useState } from 'react';
import { useForm } from 'react-hook-form';
import { useTranslation } from 'react-i18next';
import { useNavigate, useParams } from 'react-router';
import * as z from 'zod';
import { useRequestOtpMutation, useVerifyOtpMutation } from '@/api/generated';
import { Field, FormError } from '@/components/Field';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { errorKey } from '@/lib/session';

const emailForm = otpRequest.pick({ email: true });
const codeForm = otpVerifyRequest.pick({ code: true });

/**
 * Student sign-in by emailed code. /s/activate/:token is the first time (the invite names the
 * student record); /s/login is every later time. Binding the phone happens on /s.
 */
export default function StudentLogin() {
  const { t } = useTranslation();
  const { token } = useParams();
  const [email, setEmail] = useState<string>();

  return (
    <Card>
      <CardHeader>
        <CardTitle>
          <h1>{t(token ? 'studentApp.activateTitle' : 'studentApp.loginTitle')}</h1>
        </CardTitle>
        <CardDescription>
          {email ? (
            <>
              {t('studentApp.codeSent')} <bdi>{email}</bdi>
            </>
          ) : (
            t('studentApp.emailHint')
          )}
        </CardDescription>
      </CardHeader>
      {email ? (
        <CodeStep email={email} inviteToken={token} onBack={() => setEmail(undefined)} />
      ) : (
        <EmailStep inviteToken={token} onSent={setEmail} />
      )}
    </Card>
  );
}

function EmailStep({
  inviteToken,
  onSent,
}: {
  inviteToken?: string;
  onSent: (email: string) => void;
}) {
  const { t } = useTranslation();
  const [request, { error, isLoading }] = useRequestOtpMutation();
  const { register, handleSubmit, formState } = useForm<z.infer<typeof emailForm>>({
    resolver: zodResolver(emailForm),
  });

  const onSubmit = handleSubmit(async ({ email }) => {
    const res = await request({ otpRequest: { email, inviteToken } });
    if (!('error' in res)) onSent(email);
  });

  return (
    <form onSubmit={onSubmit} noValidate>
      <CardContent className="grid gap-4">
        <Field
          label={t('studentApp.email')}
          type="email"
          dir="ltr"
          autoComplete="email"
          error={formState.errors.email && t('form.invalid.email')}
          {...register('email', { setValueAs: (v: string) => v.trim() })}
        />
        <FormError message={error && t(errorKey(error))} />
        <Button type="submit" disabled={isLoading}>
          {t('studentApp.sendCode')}
        </Button>
      </CardContent>
    </form>
  );
}

function CodeStep({
  email,
  inviteToken,
  onBack,
}: {
  email: string;
  inviteToken?: string;
  onBack: () => void;
}) {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const [verify, { error, isLoading }] = useVerifyOtpMutation();
  const { register, handleSubmit, formState } = useForm<z.infer<typeof codeForm>>({
    resolver: zodResolver(codeForm),
  });

  const onSubmit = handleSubmit(async ({ code }) => {
    const res = await verify({ otpVerifyRequest: { email, code, inviteToken } });
    if (res.data) void navigate('/s', { replace: true });
  });

  return (
    <form onSubmit={onSubmit} noValidate>
      <CardContent className="grid gap-4">
        <Field
          label={t('studentApp.code')}
          inputMode="numeric"
          dir="ltr"
          autoComplete="one-time-code"
          maxLength={6}
          error={formState.errors.code && t('form.invalid.code')}
          // Arabic keyboards type ٠-٩.
          {...register('code', {
            setValueAs: (v: string) => normalizeArabic(v).replace(/\s/g, ''),
          })}
        />
        <FormError message={error && t(errorKey(error))} />
        <Button type="submit" disabled={isLoading}>
          {t('studentApp.verify')}
        </Button>
        <Button type="button" variant="ghost" onClick={onBack}>
          {t('studentApp.changeEmail')}
        </Button>
      </CardContent>
    </form>
  );
}
