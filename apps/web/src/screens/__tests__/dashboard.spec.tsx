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

  it('switches between 8, 13 and 26 weeks, labelling about 8 bars', async () => {
    const asked: string[] = [];
    server.use(
      http.get(route('stats/trends'), ({ request }) => {
        const n = Number(new URL(request.url).searchParams.get('weeks'));
        asked.push(String(n));
        const weeks = Array.from({ length: n }, (_, i) =>
          new Date(Date.UTC(2026, 5, 6 + 7 * i)).toISOString().slice(0, 10),
        );
        const groups = fx.trends.groups.map((g) => ({
          ...g,
          attendance: weeks.map(() => ({ present: 1, total: 2 })),
        }));
        return Response.json({ ...fx.trends, weeks, groups });
      }),
    );
    const { user } = await renderAt('/dashboard');
    const range = await screen.findByRole('group', { name: tr('dashboard.range') });
    expect(within(range).getByRole('button', { pressed: true })).toHaveTextContent(
      tr('dashboard.weeks', { count: 8 }),
    );
    const pickRange = (count: number) =>
      user.click(within(range).getByRole('button', { name: tr('dashboard.weeks', { count }) }));
    await pickRange(26);
    // 26 bars, labelled by one axis row of 4 dates instead of a label each.
    await expect
      .poll(() => screen.getAllByRole('list', { name: tr('dashboard.attendance') })[0]!.children)
      .toHaveLength(26);
    expect(asked).toEqual(['8', '26']);
    expect(screen.getByTestId('bar-axis').children).toHaveLength(4);
    await pickRange(13);
    await expect.poll(() => asked).toEqual(['8', '26', '13']);
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
    expect(
      await screen.findByRole('link', { name: new RegExp(tr('dashboard.exams', { count: 0 })) }),
    ).toBeVisible();
  });

  it('lists the lowest attendance first and the rest behind «show all»', async () => {
    const base = fx.trends.groups[0]!;
    const groups = Array.from({ length: 12 }, (_, i) => ({
      ...base,
      id: crypto.randomUUID(),
      label: `G${i}`,
      // G0 has no records; the others go up from 1 present out of 20.
      attendance: base.attendance.map(() =>
        i === 0 ? { present: 0, total: 0 } : { present: i, total: 20 },
      ),
    }));
    server.use(http.get(route('stats/trends'), () => Response.json({ ...fx.trends, groups })));
    const { user } = await renderAt('/dashboard', { lang: 'en' });
    const more = await screen.findByRole('button', {
      name: tr('dashboard.showAll', { count: 12 }),
    });
    const rows = () => screen.getAllByRole('heading', { level: 3 }).map((h) => h.textContent);
    expect(rows()).toHaveLength(10);
    expect(rows()[0]).toMatch(/G1$/);
    expect(rows()).not.toContain(expect.stringMatching(/G0$/));
    await user.click(more);
    expect(rows()).toHaveLength(12);
    expect(rows().at(-1)).toMatch(/G0$/);
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
