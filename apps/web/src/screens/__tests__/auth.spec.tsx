import { screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { fail, http, route, sent, server } from '@/test/server';
import { renderAt, tr } from '@/test/render';

describe('sign in', () => {
  it('signs in and goes to the page that asked for it', async () => {
    server.use(http.post(route('auth/refresh'), fail('UNAUTHENTICATED', 401)));
    const { user, router } = await renderAt('/login?next=/students', { workspace: null });
    await user.type(await screen.findByLabelText(tr('auth.login.login')), '01000000001');
    await user.type(screen.getByLabelText(tr('auth.login.password')), 'dafter-dev-123');
    await user.click(screen.getByRole('button', { name: tr('auth.login.submit') }));
    await expect.poll(() => router.state.location.pathname).toBe('/students');
    expect(sent.find((s) => s.call === 'POST /api/v1/auth/login')?.body).toEqual({
      login: '01000000001',
      password: 'dafter-dev-123',
    });
  });

  it('signed out mid-screen, keeps the page and its query in ?next (audit 3 A12)', async () => {
    server.use(
      http.get(route('me'), fail('UNAUTHENTICATED', 401)),
      http.post(route('auth/refresh'), fail('UNAUTHENTICATED', 401)),
    );
    const { router } = await renderAt('/students?q=nour');
    await expect.poll(() => router.state.location.pathname).toBe('/login');
    expect(router.state.location.search).toBe(`?next=${encodeURIComponent('/students?q=nour')}`);
  });

  it('points a student to the student sign-in (audit 3 A4)', async () => {
    await renderAt('/login', { workspace: null });
    expect(await screen.findByRole('link', { name: tr('auth.login.studentLink') })).toHaveAttribute(
      'href',
      '/s/login',
    );
  });

  it('shows the server error code translated, and validates before sending', async () => {
    server.use(http.post(route('auth/login'), fail('INVALID_CREDENTIALS', 401)));
    const { user } = await renderAt('/login', { workspace: null });
    await user.click(await screen.findByRole('button', { name: tr('auth.login.submit') }));
    expect(sent.some((s) => s.call.includes('auth/login'))).toBe(false);
    await user.type(screen.getByLabelText(tr('auth.login.login')), '01000000001');
    await user.type(screen.getByLabelText(tr('auth.login.password')), 'wrong-password');
    await user.click(screen.getByRole('button', { name: tr('auth.login.submit') }));
    expect(await screen.findByText(tr('errors.INVALID_CREDENTIALS'))).toBeInTheDocument();
  });

  it('says how long to wait when sign-in is rate-limited (audit 3 A3)', async () => {
    server.use(
      http.post(route('auth/login'), () =>
        Response.json(
          { code: 'RATE_LIMITED', details: { retryAfterSeconds: 14 * 60 + 5 } },
          { status: 429 },
        ),
      ),
    );
    const { user } = await renderAt('/login', { workspace: null });
    await user.type(await screen.findByLabelText(tr('auth.login.login')), '01000000001');
    await user.type(screen.getByLabelText(tr('auth.login.password')), 'wrong-password');
    await user.click(screen.getByRole('button', { name: tr('auth.login.submit') }));
    expect(await screen.findByRole('alert')).toHaveTextContent(
      tr('errors.retryIn', { minutes: 15 }),
    );
  });

  it('says what the optional email is for on register (audit 3 A5)', async () => {
    server.use(http.post(route('auth/refresh'), fail('UNAUTHENTICATED', 401)));
    await renderAt('/register', { workspace: null, lang: 'en' });
    expect(await screen.findByText(tr('auth.register.emailHint'))).toBeVisible();
  });

  it('shows the password on demand', async () => {
    server.use(http.post(route('auth/refresh'), fail('UNAUTHENTICATED', 401)));
    const { user } = await renderAt('/login', { workspace: null, lang: 'en' });
    const password = await screen.findByLabelText(tr('auth.login.password'));
    await user.type(password, 'secret-123');
    expect(password).toHaveAttribute('type', 'password');
    const eye = screen.getByRole('button', { name: tr('form.showPassword') });
    await user.click(eye);
    expect(password).toHaveAttribute('type', 'text');
    expect(eye).toHaveAttribute('aria-pressed', 'true');
    await user.click(eye);
    expect(password).toHaveAttribute('type', 'password');
  });
});

describe('password reset', () => {
  it('links from sign in, sends the email, and says the same thing either way', async () => {
    server.use(http.post(route('auth/refresh'), fail('UNAUTHENTICATED', 401)));
    const { user, router } = await renderAt('/login', { workspace: null });
    await user.click(await screen.findByRole('link', { name: tr('auth.login.forgot') }));
    await expect.poll(() => router.state.location.pathname).toBe('/forgot');
    const email = await screen.findByLabelText(tr('auth.forgot.email'));
    await user.type(email, 'not-an-email');
    await user.click(screen.getByRole('button', { name: tr('auth.forgot.submit') }));
    expect(await screen.findByText(tr('form.invalid.email'))).toBeInTheDocument();
    await user.clear(email);
    await user.type(email, 'mona@example.com');
    await user.click(screen.getByRole('button', { name: tr('auth.forgot.submit') }));
    expect(await screen.findByRole('status')).toHaveTextContent(tr('auth.forgot.sent'));
    expect(sent.find((s) => s.call === 'POST /api/v1/auth/password-reset')?.body).toEqual({
      email: 'mona@example.com',
    });
  });

  it('shows a rate-limit error from the request', async () => {
    server.use(
      http.post(route('auth/refresh'), fail('UNAUTHENTICATED', 401)),
      http.post(route('auth/password-reset'), fail('RATE_LIMITED', 429)),
    );
    const { user } = await renderAt('/forgot', { workspace: null, lang: 'en' });
    await user.type(await screen.findByLabelText(tr('auth.forgot.email')), 'mona@example.com');
    await user.click(screen.getByRole('button', { name: tr('auth.forgot.submit') }));
    expect(await screen.findByText(tr('errors.RATE_LIMITED'))).toBeInTheDocument();
  });

  it('sets the new password with the token from the link', async () => {
    server.use(http.post(route('auth/refresh'), fail('UNAUTHENTICATED', 401)));
    const { user } = await renderAt('/reset/abc123', { workspace: null });
    const password = await screen.findByLabelText(tr('auth.reset.password'));
    await user.type(password, 'short');
    await user.click(screen.getByRole('button', { name: tr('auth.reset.submit') }));
    expect(await screen.findByText(tr('form.invalid.password'))).toBeInTheDocument();
    await user.type(password, '-but-long-now');
    await user.click(screen.getByRole('button', { name: tr('auth.reset.submit') }));
    expect(await screen.findByRole('status')).toHaveTextContent(tr('auth.reset.done'));
    expect(sent.find((s) => s.call === 'POST /api/v1/auth/password-reset/confirm')?.body).toEqual({
      token: 'abc123',
      password: 'short-but-long-now',
    });
    expect(screen.getByRole('link', { name: tr('auth.forgot.back') })).toHaveAttribute(
      'href',
      '/login',
    );
  });

  it('offers a new link when the token is used or expired', async () => {
    server.use(
      http.post(route('auth/refresh'), fail('UNAUTHENTICATED', 401)),
      http.post(route('auth/password-reset/confirm'), fail('RESET_INVALID', 410)),
    );
    const { user } = await renderAt('/reset/used', { workspace: null, lang: 'en' });
    await user.type(await screen.findByLabelText(tr('auth.reset.password')), 'new horse battery');
    await user.click(screen.getByRole('button', { name: tr('auth.reset.submit') }));
    expect(await screen.findByText(tr('errors.RESET_INVALID'))).toBeInTheDocument();
    expect(screen.getByRole('link', { name: tr('auth.reset.again') })).toHaveAttribute(
      'href',
      '/forgot',
    );
  });
});
