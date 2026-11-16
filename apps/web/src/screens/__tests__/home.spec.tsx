import { screen, within } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { getWorkspaceId } from '@/api/base';
import { formatEgp } from '@/lib/money';
import { fail, fx, http, route, sent, server } from '@/test/server';
import { renderAt, seen, tr } from '@/test/render';

const at = (min: number) => new Date(Date.now() + min * 60_000).toISOString();
const session = (status: string, startsInMin: number) => ({
  ...fx.sessions[1]!,
  id: crypto.randomUUID(),
  status,
  startsAt: at(startsInMin),
  endsAt: at(startsInMin + 90),
});
const withSessions = (list: unknown[]) =>
  server.use(http.get(route('sessions'), () => Response.json(list)));

afterEach(() => vi.useRealTimers());

describe('today', () => {
  it('leads with the open session, then the numbers, the week and the day', async () => {
    await renderAt('/');
    const next = await screen.findByRole('region', { name: fx.sessions[0]!.subject.nameAr });
    expect(within(next).getByText(tr('today.inProgress'))).toBeInTheDocument();
    expect(within(next).getByRole('link', { name: tr('today.continue') })).toHaveAttribute(
      'href',
      `/sessions/${fx.sessions[0]!.id}/live`,
    );
    expect(await within(next).findByText(tr('today.enrolled', { count: 2 }))).toBeInTheDocument();
    expect(screen.getByText(tr('stats.checkedIn'))).toBeInTheDocument();
    expect(screen.getByRole('list', { name: tr('stats.week') }).children).toHaveLength(7);
    expect(screen.getByText(tr('today.allSessions'))).toBeInTheDocument();
    // Only the open or next class has a button; later ones don't (audit 3 H5).
    expect(screen.queryByRole('link', { name: tr('today.start') })).toBeNull();
    expect(screen.getByText(tr('timetable.status.closed'))).toBeInTheDocument();
    expect(screen.getAllByRole('link', { name: new RegExp(tr('nav.messages')) })).toHaveLength(2);
  });

  it('counts down to a scheduled session, and keeps the countdown fresh', async () => {
    vi.useFakeTimers({ toFake: ['setInterval'] });
    withSessions([session('scheduled', 25), session('cancelled', 200)]);
    await renderAt('/', { lang: 'en' });
    expect(await screen.findByText(/in 25 minutes/)).toBeInTheDocument();
    expect(screen.getByText(tr('timetable.status.cancelled'))).toBeInTheDocument();
    vi.advanceTimersByTime(30_000);
    expect(screen.getByRole('link', { name: tr('today.startQr') })).toBeInTheDocument();
  });

  it('shows when a class far ahead opens, instead of Start (audit 3 H4)', async () => {
    withSessions([session('scheduled', 120)]);
    await renderAt('/', { lang: 'en' });
    const next = await screen.findByRole('region', { name: fx.sessions[1]!.subject.nameEn });
    expect(within(next).getByText(new RegExp(tr('today.opensAt').split('{')[0]!))).toBeVisible();
    expect(within(next).queryByRole('link', { name: tr('today.startQr') })).toBeNull();
  });

  it('says a late session started, and counts hours when it is far', async () => {
    withSessions([session('scheduled', -150), session('open', 10)]);
    await renderAt('/', { lang: 'en' });
    expect(await screen.findByText(/2 hours ago/)).toBeInTheDocument();
    expect(screen.getByRole('link', { name: tr('today.continue') })).toBeInTheDocument();
  });

  it('says when the day is done, or empty', async () => {
    withSessions([{ ...fx.sessions[2]! }]);
    const { unmount } = await renderAt('/');
    expect(await screen.findByText(tr('today.allDone'))).toBeInTheDocument();
    unmount();
    withSessions([]);
    await renderAt('/');
    expect(await screen.findByText(tr('today.none'))).toBeInTheDocument();
  });

  it('jumps the numbers with reduced motion, and handles an empty week', async () => {
    const original = window.matchMedia;
    window.matchMedia = (q: string) => ({ ...original(q), matches: true });
    server.use(
      http.get(route('stats/today'), () =>
        Response.json({
          ...fx.stats,
          week: fx.stats.week.map((d) => ({ ...d, total: 0, present: 0 })),
        }),
      ),
    );
    await renderAt('/');
    expect(await screen.findByText(String(fx.stats.activeStudents))).toBeInTheDocument();
    window.matchMedia = original;
  });

  it('shows a failed request as its error', async () => {
    server.use(http.get(route('stats/today'), fail('FORBIDDEN', 403)));
    await renderAt('/');
    expect(await screen.findByRole('alert')).toHaveTextContent(tr('errors.FORBIDDEN'));
  });

  it("keeps messages out of a teacher's quick actions (the nav has their own log)", async () => {
    server.use(
      http.get(route('workspaces/current'), () =>
        Response.json({ ...fx.currentWorkspace, role: 'teacher' }),
      ),
    );
    await renderAt('/');
    const quick = (await screen.findByText(tr('today.quick'))).parentElement!;
    expect(
      within(quick).queryAllByRole('link', { name: new RegExp(tr('nav.messages')) }),
    ).toHaveLength(0);
  });

  it('sends a user without a workspace to pick one, and forgets a removed one', async () => {
    const { router, unmount } = await renderAt('/', { workspace: null });
    await expect.poll(() => router.state.location.pathname).toBe('/workspaces');
    unmount();
    server.use(http.get(route('workspaces/current'), fail('WORKSPACE_NOT_FOUND', 404)));
    const second = await renderAt('/');
    await expect.poll(() => second.router.state.location.pathname).toBe('/workspaces');
    expect(getWorkspaceId()).toBeNull();
  });
});

describe('record a payment from today', () => {
  const name = new RegExp(fx.students[0]!.nameAr);

  it('finds the student, pays what they owe and offers the receipt', async () => {
    const { user } = await renderAt('/');
    await user.click(await screen.findByRole('button', { name: tr('today.recordPayment') }));
    const sheet = screen.getByRole('dialog', { name: tr('fees.record') });
    // Before typing, who owes is listed, with what they owe.
    expect(await within(sheet).findByText(tr('payments.owing'))).toBeVisible();
    expect(within(sheet).getAllByRole('button', { name: name })[0]).toHaveTextContent(
      seen(formatEgp(50000, 'ar')),
    );
    await user.type(within(sheet).getByRole('searchbox'), 'نور');
    await user.click(await within(sheet).findByRole('button', { name }));
    await user.click(await within(sheet).findByRole('button', { name: tr('payments.change') }));
    await user.type(within(sheet).getByRole('searchbox'), 'نور');
    await user.click(await within(sheet).findByRole('button', { name }));
    await user.click(await within(sheet).findByRole('button', { name: tr('fees.save') }));
    expect(sent.find((s) => s.call === 'POST /api/v1/payments')?.body).toMatchObject({
      studentId: fx.students[0]!.id,
      amountPiastres: fx.ledger.balancePiastres,
      method: 'cash',
    });
    expect(
      await within(sheet).findByText(tr('payments.done', { name: fx.students[0]!.nameAr })),
    ).toBeInTheDocument();
    expect(within(sheet).getByRole('link', { name: new RegExp(tr('fees.receipt')) })).toBeVisible();
    await user.click(within(sheet).getByRole('button', { name: tr('payments.another') }));
    expect(within(sheet).getByRole('searchbox')).toHaveValue('');
    await user.click(within(sheet).getByRole('button', { name: tr('payments.close') }));
    expect(sheet).not.toHaveAttribute('open');
  });

  it('says when nothing matches, and when a student has no groups', async () => {
    server.use(
      http.get(route('students'), ({ request }) =>
        Response.json(
          new URL(request.url).searchParams.get('q') === 'x'
            ? []
            : [{ ...fx.students[0]!, nameEn: 'Nour' }],
        ),
      ),
      http.get(route('students/:id/enrollments'), () => Response.json([])),
    );
    const { user } = await renderAt('/', { lang: 'en' });
    await user.click(await screen.findByRole('button', { name: tr('today.recordPayment') }));
    const box = within(screen.getByRole('dialog')).getByRole('searchbox');
    await user.type(box, 'x');
    expect(await screen.findByText(tr('students.noResults'))).toBeInTheDocument();
    await user.clear(box);
    await user.type(box, 'Nour');
    await user.click(await screen.findByRole('button', { name: /Nour/ }));
    expect(await screen.findByText(tr('enrollments.empty'))).toBeInTheDocument();
  });

  it('shows a failed search', async () => {
    server.use(http.get(route('students'), fail('FORBIDDEN', 403)));
    const { user } = await renderAt('/');
    await user.click(await screen.findByRole('button', { name: tr('today.recordPayment') }));
    await user.type(screen.getAllByRole('searchbox').at(-1)!, 'x');
    expect(await screen.findByText(tr('errors.FORBIDDEN'))).toBeInTheDocument();
  });
});
