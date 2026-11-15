import { screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { displayTime } from '@/lib/time';
import { fx, http, route, sent, server } from '@/test/server';
import { renderAt, tr } from '@/test/render';

const asRole = (role: string) =>
  server.use(
    http.get(route('workspaces/current'), () => Response.json({ ...fx.currentWorkspace, role })),
  );

describe('too early to open', () => {
  it('says when the session can be opened, in the center time', async () => {
    const opensAt = '2026-11-28T13:30:00.000Z';
    server.use(
      http.post(route('sessions/:id/open'), () =>
        Response.json({ code: 'SESSION_TOO_EARLY', details: { opensAt } }, { status: 409 }),
      ),
    );
    await renderAt(`/sessions/${fx.openSession.sessionId}/live`);
    const time = displayTime(opensAt, fx.currentWorkspace.timezone, 'ar');
    expect(await screen.findByRole('alert')).toHaveTextContent(
      tr('live.tooEarly', { time: `⁨${time}⁩` }),
    );
    expect(screen.queryByTestId('session-qr')).not.toBeInTheDocument();
  });
});

describe('message log for a teacher', () => {
  it('shows the log with the teacher note, without the settings or the wording', async () => {
    asRole('teacher');
    await renderAt('/messages');
    expect(await screen.findByText(tr('messages.teacherView'))).toBeVisible();
    expect(await screen.findByTestId('message-log')).toBeVisible();
    expect(
      screen.queryByRole('heading', { name: tr('messages.settings') }),
    ).not.toBeInTheDocument();
    expect(
      screen.queryByRole('heading', { name: tr('messages.wording.title') }),
    ).not.toBeInTheDocument();
    // Teachers can't read these, so the screen doesn't ask.
    expect(sent.some((s) => s.call.includes('message-settings'))).toBe(false);
    expect(sent.some((s) => s.call.includes('message-templates'))).toBe(false);
  });

  it('lists Messages under More for a teacher, without Fees', async () => {
    asRole('teacher');
    await renderAt('/more');
    const nav = await screen.findByRole('link', { name: tr('nav.messages') });
    expect(nav).toHaveAttribute('href', '/messages');
    expect(screen.queryByRole('link', { name: tr('nav.fees') })).not.toBeInTheDocument();
  });

  it('keeps the settings for the owner, one tap from the log', async () => {
    const { user } = await renderAt('/messages');
    expect(await screen.findByTestId('message-log')).toBeVisible();
    expect(screen.queryByText(tr('messages.teacherView'))).not.toBeInTheDocument();
    await user.click(screen.getByRole('link', { name: tr('messages.settingsTitle') }));
    expect(await screen.findByRole('heading', { name: tr('messages.settings') })).toBeVisible();
  });
});
