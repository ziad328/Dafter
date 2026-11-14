import { screen, within } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { formatEgp } from '@/lib/money';
import { fail, fx, http, route, server } from '@/test/server';
import { renderAt, seen, tr } from '@/test/render';

describe('fees view', () => {
  it('shows money collected today and this month by method, and who owes', async () => {
    server.use(
      http.get(route('students'), ({ request }) =>
        Response.json(
          new URL(request.url).searchParams.get('owes') === 'true'
            ? fx.students.filter((s) => s.balancePiastres > 0)
            : [],
        ),
      ),
    );
    await renderAt('/fees');
    expect(await screen.findByText(tr('feesView.today'))).toBeVisible();
    expect(screen.getByText(seen(formatEgp(45050, 'ar')))).toBeVisible();
    expect(screen.getByText(seen(formatEgp(185050, 'ar')))).toBeVisible();
    expect(screen.getAllByText(tr('fees.methods.instapay'))).toHaveLength(2);
    const owed = await screen.findAllByText(seen(formatEgp(50000, 'ar')));
    expect(owed.at(-1)!.closest('a')).toHaveAttribute(
      'href',
      expect.stringMatching(/^\/students\//),
    );
    expect(screen.getByRole('heading', { name: tr('feesView.owing', { count: 1 }) })).toBeVisible();
  });

  it('says when nobody owes, and shows a failed request', async () => {
    server.use(
      http.get(route('students'), () => Response.json([])),
      http.get(route('stats/collections'), fail('FORBIDDEN', 403)),
    );
    await renderAt('/fees', { lang: 'en' });
    expect(await screen.findByText(tr('feesView.noneOwe'))).toBeVisible();
    expect(await screen.findByRole('alert')).toHaveTextContent(tr('errors.FORBIDDEN'));
  });

  it('is listed under More', async () => {
    await renderAt('/more');
    const nav = await screen.findByRole('navigation', { name: tr('nav.more') });
    expect(within(nav).getByRole('link', { name: tr('nav.fees') })).toHaveAttribute(
      'href',
      '/fees',
    );
  });
});
