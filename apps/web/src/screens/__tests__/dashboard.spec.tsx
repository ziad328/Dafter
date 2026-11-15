import { screen, within } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { formatEgp } from '@/lib/money';
import { fail, fx, http, route, server } from '@/test/server';
import { renderAt, seen, tr } from '@/test/render';

describe('dashboard', () => {
  it('shows weekly attendance, money per month and each group with its exams', async () => {
    const { user, router } = await renderAt('/dashboard');
    expect(await screen.findByRole('heading', { name: tr('dashboard.title') })).toBeVisible();
    // 18 of 20 records over the 8 weeks.
    expect(screen.getAllByText('90%').length).toBeGreaterThan(0);
    const money = screen.getByTestId('money-trend');
    expect(within(money).getByText(new RegExp(seen(formatEgp(50000, 'ar'))))).toBeInTheDocument();
    expect(screen.getByText(/مجموعة أ/)).toBeVisible();
    expect(screen.getByText(tr('dashboard.lastAverage', { pct: 82.5 }))).toBeVisible();
    await user.click(
      screen.getByRole('link', { name: new RegExp(tr('dashboard.exams', { count: 1 })) }),
    );
    expect(router.state.location.pathname).toBe(`/groups/${fx.group.id}/exams`);
  });

  it('hides money for teachers and shows an empty state, in English', async () => {
    server.use(
      http.get(route('stats/trends'), () =>
        Response.json({ ...fx.trends, groups: [], money: null }),
      ),
    );
    await renderAt('/dashboard', { lang: 'en' });
    expect(await screen.findByText('No groups yet.')).toBeVisible();
    expect(screen.queryByTestId('money-trend')).toBeNull();
    expect(screen.getAllByText(/No attendance recorded/).length).toBe(8);
  });

  it('shows a group without graded exams, and an error', async () => {
    server.use(
      http.get(route('stats/trends'), () =>
        Response.json({
          ...fx.trends,
          groups: [{ ...fx.trends.groups[0]!, label: null, exams: [] }],
        }),
      ),
    );
    await renderAt('/dashboard');
    expect(await screen.findByText(tr('dashboard.exams', { count: 0 }))).toBeVisible();
  });

  it('shows the error code translated', async () => {
    server.use(http.get(route('stats/trends'), fail('INTERNAL', 500)));
    await renderAt('/dashboard');
    expect(await screen.findByText(tr('errors.INTERNAL'))).toBeVisible();
  });

  it('is in the nav', async () => {
    const { user, router } = await renderAt('/more');
    await user.click(await screen.findByRole('link', { name: tr('nav.dashboard') }));
    expect(router.state.location.pathname).toBe('/dashboard');
  });
});
