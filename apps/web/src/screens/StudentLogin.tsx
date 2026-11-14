import { Download, Smartphone } from 'lucide-react';
import { normalizeArabic, otpRequest, otpVerifyRequest } from '@dafter/contracts';
import { zodResolver } from '@hookform/resolvers/zod';
import { useEffect, useState } from 'react';
import { useForm } from 'react-hook-form';
import { useTranslation } from 'react-i18next';
import { useNavigate, useParams } from 'react-router';
import * as z from 'zod';
import { useRequestOtpMutation, useVerifyOtpMutation } from '@/api/generated';
import { Field, FormError } from '@/components/Field';
import { IconBadge } from '@/components/Page';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import {
  inviteFromText,
  isInstalled,
  isIos,
  saveInvite,
  savedInvite,
  useInstallPrompt,
} from '@/lib/pwa';
import { errorKey } from '@/lib/session';

const emailForm = otpRequest.pick({ email: true });
const codeForm = otpVerifyRequest.pick({ code: true });

/**
 * Student sign-in by emailed code. /s/activate/:token is the first time (the invite names the
 * student record); /s/login is every later time. Binding the phone happens on /s.
 * Rule 13: in a browser tab this only shows how to install; the forms run in the installed app.
 */
export default function StudentLogin() {
  const params = useParams();
  // Android carries the invite into the installed app through shared storage.
  const token = params.token ?? savedInvite() ?? undefined;
  useEffect(() => {
    if (params.token) saveInvite(params.token);
  }, [params.token]);
  if (!isInstalled()) return <InstallGate />;
  return <SignIn token={token} />;
}

function SignIn({ token }: { token?: string }) {
  const { t } = useTranslation();
  const [email, setEmail] = useState<string>();

  return (
    <Card>
      <CardHeader>
        <IconBadge icon={Smartphone} />
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
        <>
          {/* Brevo's free sender often lands in spam; say so before the student gives up. */}
          <p role="note" className="mx-6 rounded-xl bg-amber-soft px-4 py-3 text-sm text-late">
            {t('studentApp.checkSpam')}
          </p>
          <CodeStep email={email} inviteToken={token} onBack={() => setEmail(undefined)} />
        </>
      ) : (
        <EmailStep inviteToken={token} onSent={setEmail} />
      )}
      {!token && <PasteInvite />}
    </Card>
  );
}

/** In a browser tab: install first (Android button, iPhone instructions). */
function InstallGate() {
  const { t } = useTranslation();
  const install = useInstallPrompt();
  return (
    <Card>
      <CardHeader>
        <IconBadge icon={Download} />
        <CardTitle>
          <h1>{t('install.title')}</h1>
        </CardTitle>
        <CardDescription>{t('install.why')}</CardDescription>
      </CardHeader>
      <CardContent className="grid gap-3 text-sm">
        {install ? (
          <Button onClick={install}>{t('install.button')}</Button>
        ) : (
          <p>{t(isIos() ? 'install.ios' : 'install.other')}</p>
        )}
        <p className="text-muted-foreground">{t('install.then')}</p>
      </CardContent>
    </Card>
  );
}

/** First time on iPhone: the installed app cannot see the browser's storage, so paste the link. */
function PasteInvite() {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const [text, setText] = useState('');
  const token = inviteFromText(text);
  return (
    <CardContent className="mt-4 grid gap-3 border-t pt-4">
      <Field
        label={t('install.paste')}
        dir="ltr"
        autoComplete="off"
        value={text}
        onChange={(e) => setText(e.target.value)}
        error={text && !token ? t('install.pasteInvalid') : undefined}
      />
      <Button
        type="button"
        variant="outline"
        disabled={!token}
        onClick={() => void navigate(`/s/activate/${token}`)}
      >
        {t('install.activate')}
      </Button>
    </CardContent>
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
    // A used or expired saved link would block every later try; forget it.
    if ('error' in res && errorKey(res.error) === 'errors.INVITE_INVALID') saveInvite(null);
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
    if (res.data) {
      saveInvite(null);
      void navigate('/s', { replace: true });
    }
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
