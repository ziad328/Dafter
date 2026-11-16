import {
  ClipboardCopy,
  ClipboardPaste,
  Download,
  EllipsisVertical,
  type LucideIcon,
  Share,
  Smartphone,
  SquarePlus,
} from 'lucide-react';
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
        <CodeStep email={email} inviteToken={token} onBack={() => setEmail(undefined)} />
      ) : (
        <EmailStep inviteToken={token} onSent={setEmail} />
      )}
      {!token && <PasteInvite />}
    </Card>
  );
}

/** In a browser tab: install first (Android button, iPhone instructions). */
const IOS_STEPS = [
  { icon: Share, key: 'iosShare' },
  { icon: SquarePlus, key: 'iosAdd' },
  { icon: ClipboardPaste, key: 'open' },
] as const;
const OTHER_STEPS = [
  { icon: EllipsisVertical, key: 'menu' },
  { icon: Download, key: 'install' },
  { icon: ClipboardPaste, key: 'open' },
] as const;

/**
 * One step of a vertical stepper: the number on a line joining the steps, what to do, and the
 * button to look for on the screen, drawn as it looks there.
 */
function InstallStep({
  n,
  icon: Icon,
  text,
  last,
}: {
  n: number;
  icon: LucideIcon;
  text: string;
  last: boolean;
}) {
  return (
    <li className="relative flex gap-3 pb-5 last:pb-0">
      {!last && (
        <span
          aria-hidden
          className="absolute start-4 top-9 bottom-1 w-px -translate-x-1/2 bg-border rtl:translate-x-1/2"
        />
      )}
      <span
        aria-hidden
        className="grid size-8 shrink-0 place-items-center rounded-full bg-primary text-sm font-bold text-primary-foreground"
      >
        <bdi>{n}</bdi>
      </span>
      <span className="flex min-w-0 flex-1 items-start justify-between gap-3 pt-1">
        <span className="leading-relaxed">{text}</span>
        <span
          aria-hidden
          className="grid size-9 shrink-0 place-items-center rounded-lg border bg-card text-ink shadow-xs"
        >
          <Icon className="size-5" />
        </span>
      </span>
    </li>
  );
}

function InstallGate() {
  const { t } = useTranslation();
  const install = useInstallPrompt();
  const { token } = useParams();
  const ios = isIos();
  const [copied, setCopied] = useState(false);
  return (
    <Card>
      <CardHeader>
        <IconBadge icon={Download} />
        <CardTitle>
          <h1>{t('install.title')}</h1>
        </CardTitle>
        <CardDescription>{t('install.why')}</CardDescription>
      </CardHeader>
      <CardContent className="grid gap-4 text-sm">
        {install && <Button onClick={install}>{t('install.button')}</Button>}
        {/* Three pictures, one per tap: the hardest step for a 15-year-old (audit S7). */}
        <ol className="rounded-xl bg-muted/50 p-4" data-testid="install-steps">
          {(ios ? IOS_STEPS : OTHER_STEPS).map(({ icon, key }, i, all) => (
            <InstallStep
              key={key}
              n={i + 1}
              icon={icon}
              text={t(`install.steps.${key}`)}
              last={i === all.length - 1}
            />
          ))}
        </ol>
        {/* The installed app on iPhone can't see this tab's link, so keep it ready to paste. */}
        {token && (
          <Button
            variant="outline"
            onClick={() =>
              void navigator.clipboard?.writeText(location.href).then(() => setCopied(true))
            }
          >
            <ClipboardCopy aria-hidden />
            {t(copied ? 'install.copied' : 'install.copyLink')}
          </Button>
        )}
      </CardContent>
    </Card>
  );
}

/** First time on iPhone: the installed app cannot see the browser's storage, so paste the link. */
function PasteInvite() {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const [open, setOpen] = useState(false);
  const [text, setText] = useState('');
  const token = inviteFromText(text);
  // Returning students only sign in; the paste box is for the first time (audit A3).
  if (!open)
    return (
      <CardContent className="mt-4 border-t pt-2">
        <Button type="button" variant="link" className="px-0" onClick={() => setOpen(true)}>
          {t('install.firstTime')}
        </Button>
      </CardContent>
    );
  return (
    <CardContent className="mt-4 grid gap-3 border-t pt-4">
      <Field
        label={t('install.paste')}
        dir="ltr"
        autoComplete="off"
        autoFocus
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

const RESEND_AFTER_S = 60;

/** Seconds left of a countdown that restarts whenever `key` changes. */
function useCountdown(seconds: number, key: number) {
  const [left, setLeft] = useState(seconds);
  useEffect(() => {
    setLeft(seconds);
    const timer = setInterval(() => setLeft((s) => Math.max(0, s - 1)), 1000);
    return () => clearInterval(timer);
  }, [seconds, key]);
  return left;
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
  const [resend, resending] = useRequestOtpMutation();
  // A new countdown per sent code: the hint and «أعد إرسال الكود» wait 60 s (audit 3 SA5).
  const [sends, setSends] = useState(0);
  const left = useCountdown(RESEND_AFTER_S, sends);
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
        {/* Brevo's free sender often lands in spam: said once the code is late, not at once. */}
        {left === 0 && (
          <p role="note" className="text-sm text-muted-foreground">
            {t('studentApp.checkSpam')}
          </p>
        )}
        <FormError
          message={(error ?? resending.error) && t(errorKey((error ?? resending.error)!))}
        />
        <Button type="submit" disabled={isLoading}>
          {t('studentApp.verify')}
        </Button>
        <Button
          type="button"
          variant="outline"
          disabled={left > 0 || resending.isLoading}
          onClick={async () => {
            const res = await resend({ otpRequest: { email, inviteToken } });
            if (!('error' in res)) setSends((n) => n + 1);
          }}
        >
          {left > 0 ? (
            <bdi>{t('studentApp.resendIn', { seconds: left })}</bdi>
          ) : (
            t('studentApp.resend')
          )}
        </Button>
        <Button type="button" variant="ghost" onClick={onBack}>
          {t('studentApp.changeEmail')}
        </Button>
      </CardContent>
    </form>
  );
}
