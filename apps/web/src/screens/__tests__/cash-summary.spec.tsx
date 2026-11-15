import { fireEvent, screen, within } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { formatEgp } from '@/lib/money';
import { fail, http, route, sent, server } from '@/test/server';
import { renderAt, seen, tr } from '@/test/render';

describe('cash summary', () => {
  it("shows each staff member's totals by method and entries, voided ones marked", async () => {
    await renderAt('/cash-summary');
    expect(await screen.findByRole('heading', { name: tr('cashSummary.title') })).toBeVisible();
    const mona = screen.getByRole('region', { name: 'منى' });
    expect(within(mona).getByTestId('staff-total')).toHaveTextContent(seen(formatEgp(40050, 'ar')));
    expect(within(mona).getAllByRole('row')).toHaveLength(4);
    const voided = within(mona)
      .getAllByText(seen(formatEgp(-5000, 'ar')))
      .at(-1)!
      .closest('tr')!;
    expect(voided).toHaveClass('text-rose');
    expect(voided).toHaveTextContent(tr('cashSummary.reversed'));
    const karim = screen.getByRole('region', { name: 'كريم' });
    expect(within(karim).getByText(tr('cashSummary.empty'))).toBeVisible();

    const print = vi.spyOn(window, 'print').mockImplementation(() => {});
    fireEvent.click(screen.getByRole('button', { name: tr('receipt.print') }));
    expect(print).toHaveBeenCalled();
  });

  it('loads a chosen day, in English with the English center name', async () => {
    await renderAt('/cash-summary', { lang: 'en' });
    const day = await screen.findByLabelText(tr('cashSummary.day'));
    expect(screen.getByText('Al Nour Center')).toBeVisible();
    fireEvent.change(day, { target: { value: '2026-11-20' } });
    expect(await screen.findByDisplayValue('2026-11-20')).toBeVisible();
    expect(sent.some((s) => s.call.endsWith('stats/cash-summary?date=2026-11-20'))).toBe(true);
    // Clearing the field goes back to today.
    fireEvent.change(day, { target: { value: '' } });
    expect(await screen.findByDisplayValue('2026-11-21')).toBeVisible();
  });

  it('shows a failed request', async () => {
    server.use(http.get(route('stats/cash-summary'), fail('FORBIDDEN', 403)));
    await renderAt('/cash-summary');
    expect(await screen.findByRole('alert')).toHaveTextContent(tr('errors.FORBIDDEN'));
  });

  it('is listed under More with a breadcrumb', async () => {
    await renderAt('/more');
    const nav = await screen.findByRole('navigation', { name: tr('nav.more') });
    expect(within(nav).getByRole('link', { name: tr('nav.cashSummary') })).toHaveAttribute(
      'href',
      '/cash-summary',
    );
  });
});
