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
});
