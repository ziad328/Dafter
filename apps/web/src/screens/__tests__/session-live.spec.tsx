import { screen, within } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { fail, fx, http, route, sent, server } from '@/test/server';
import { renderAt, tr } from '@/test/render';

const id = fx.openSession.sessionId;
const page = `/sessions/${id}/live`;
const [first, second] = fx.roster;
const call = (c: string) => sent.find((s) => s.call === c);

/** A live stream that sends `lines` and then stays open, like the server's. */
const live = (...events: unknown[]) =>
  server.use(
    http.get(
      route('sessions/:id/live'),
      () =>
        new Response(
          new ReadableStream({
            start(c) {
              const text = [
                'event: ping\n\n',
                ...events.map((e) => `data: ${JSON.stringify(e)}\n\n`),
              ];
              c.enqueue(new TextEncoder().encode(text.join('')));
            },
          }),
          { headers: { 'content-type': 'text/event-stream' } },
        ),
    ),
  );

describe('live session', () => {
  it('opens the session, draws the QR and lists who checked in live', async () => {
    const now = new Date().toISOString();
    const older = new Date(Date.now() - 60_000).toISOString();
    live(
      { ...fx.record(first!.studentId, 'present'), recordedAt: now },
      { ...fx.record(first!.studentId, 'absent'), recordedAt: older },
      {
        ...fx.record(first!.studentId, 'present'),
        studentId: 'make-up',
        nameAr: 'ضيف',
        recordedAt: now,
      },
    );
    await renderAt(page);
    const qr = await screen.findByTestId('session-qr');
    expect(qr.dataset.code).toMatch(new RegExp(`^${id}\\.\\d+\\.`));
    expect(screen.getByRole('heading', { level: 1 })).toHaveTextContent(
      fx.sessions[0]!.subject.nameAr,
    );
    expect(await screen.findByText(tr('live.count', { count: 2 }))).toBeVisible();
    expect(screen.getByText(tr('live.expected', { count: 2 }))).toBeVisible();
    const list = screen.getByTestId('live-list');
    expect(within(list).getByText('ضيف')).toBeVisible();
    expect(
      within(list).getByRole('button', { name: tr('live.change', { name: first!.nameAr }) }),
    ).toHaveTextContent(tr('live.status.present'));
    // The QR keeps rotating on a timer; a tick inside the same window draws nothing new.
    await new Promise((r) => setTimeout(r, 600));
    expect(screen.getByTestId('session-qr')).toBeVisible();
  });

  it('marks a student present, then corrects it to late', async () => {
    const { user } = await renderAt(page);
    const mark = await screen.findByRole('button', {
      name: tr('live.markPresent', { name: second!.nameAr }),
    });
    await user.click(mark);
    await expect
      .poll(() => call(`PUT /api/v1/sessions/${id}/attendance/${second!.studentId}`)?.body)
      .toEqual({ status: 'present' });
    const change = await screen.findByRole('button', {
      name: tr('live.change', { name: second!.nameAr }),
    });
    await user.click(change);
    const choices = screen.getByRole('group', {
      name: tr('live.change', { name: second!.nameAr }),
    });
    await user.click(within(choices).getByRole('button', { name: tr('live.status.late') }));
    expect(
      await screen.findByRole('button', { name: tr('live.change', { name: second!.nameAr }) }),
    ).toHaveTextContent(tr('live.status.late'));
    expect(screen.queryByRole('group')).toBeNull();
  });

  it('shows a failed mark, and a failed class list', async () => {
    server.use(
      http.put(route('sessions/:id/attendance/:studentId'), fail('SESSION_NOT_OPEN', 409)),
    );
    const { user, unmount } = await renderAt(page);
    await user.click(
      await screen.findByRole('button', { name: tr('live.markPresent', { name: first!.nameAr }) }),
    );
    expect(await screen.findByText(tr('errors.SESSION_NOT_OPEN'))).toBeVisible();
    unmount();
    server.use(http.get(route('sessions/:id/roster'), fail('FORBIDDEN', 403)));
    await renderAt(page);
    expect(await screen.findByText(tr('errors.FORBIDDEN'))).toBeVisible();
  });

  it('goes full screen for scanning and back, and jumps to the list', async () => {
    const { user } = await renderAt(page, { lang: 'en' });
    await user.click(await screen.findByRole('button', { name: tr('live.toList') }));
    await user.click(screen.getByRole('button', { name: tr('live.fullScreen') }));
    expect(screen.getAllByText(tr('live.count', { count: 0 }))).toHaveLength(2);
    await user.click(screen.getByRole('button', { name: tr('live.exitFullScreen') }));
    expect(screen.getAllByText(tr('live.count', { count: 0 }))).toHaveLength(1);
  });

  it('closes after a confirm and marks the rest absent', async () => {
    const { user } = await renderAt(page);
    await user.click(await screen.findByRole('button', { name: tr('live.close') }));
    await user.click(screen.getByRole('button', { name: tr('live.confirmClose') }));
    expect(await screen.findByRole('status')).toHaveTextContent(tr('live.closed'));
    expect(screen.getByText(new RegExp(tr('live.status.absent')))).toBeVisible();
    expect(screen.getByRole('link', { name: tr('live.back') })).toHaveAttribute(
      'href',
      '/timetable',
    );
    expect(screen.queryByTestId('session-qr')).toBeNull();
  });

  it('shows a failed close, and a session that will not open', async () => {
    server.use(http.post(route('sessions/:id/close'), fail('SESSION_NOT_OPEN', 409)));
    const { user, unmount } = await renderAt(page);
    await user.click(await screen.findByRole('button', { name: tr('live.close') }));
    await user.click(screen.getByRole('button', { name: tr('live.confirmClose') }));
    expect(await screen.findByText(tr('errors.SESSION_NOT_OPEN'))).toBeVisible();
    unmount();
    server.use(http.post(route('sessions/:id/open'), fail('FORBIDDEN', 409)));
    await renderAt(page);
    expect(await screen.findByRole('alert')).toHaveTextContent(tr('errors.FORBIDDEN'));
  });

  it('shows English names, and no title for a session not on today’s list', async () => {
    server.use(
      http.get(route('sessions/:id/roster'), () =>
        Response.json([{ ...first!, nameEn: 'Mariam' }]),
      ),
      http.get(route('sessions'), () => Response.json([])),
    );
    await renderAt(page, { lang: 'en' });
    expect(await screen.findByText('Mariam')).toBeVisible();
    expect(screen.queryByRole('heading', { level: 1 })).toBeNull();
  });
});
