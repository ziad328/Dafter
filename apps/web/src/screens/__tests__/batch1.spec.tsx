import { screen, within } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { fail, fx, http, route, sent, server } from '@/test/server';
import { pick, renderAt, tr } from '@/test/render';

const body = (c: string) => sent.findLast((s) => s.call === c)?.body;
const asRole = (role: string) =>
  server.use(
    http.get(route('workspaces/current'), () => Response.json({ ...fx.currentWorkspace, role })),
  );

describe('archive a group', () => {
  it('archives after a second tap, then goes back to the list', async () => {
    const { user, router } = await renderAt(`/groups/${fx.group.id}/edit`);
    await user.click(await screen.findByRole('button', { name: tr('groups.archive') }));
    expect(screen.getByText(tr('groups.archiveHint'))).toBeVisible();
    expect(body(`PATCH /api/v1/groups/${fx.group.id}`)).toBeUndefined();
    await user.click(screen.getByRole('button', { name: tr('groups.confirmArchive') }));
    await expect.poll(() => router.state.location.pathname).toBe('/groups');
    expect(body(`PATCH /api/v1/groups/${fx.group.id}`)).toEqual({ status: 'archived' });
  });

  it('restores an archived group in one tap, and stays on a failed save', async () => {
    server.use(
      http.get(route('groups/:id'), () => Response.json({ ...fx.group, status: 'archived' })),
      http.patch(route('groups/:id'), fail('FORBIDDEN', 403)),
    );
    const { user, router } = await renderAt(`/groups/${fx.group.id}/edit`, { lang: 'en' });
    await user.click(await screen.findByRole('button', { name: tr('groups.restore') }));
    expect(await screen.findByRole('alert')).toHaveTextContent(tr('errors.FORBIDDEN'));
    expect(router.state.location.pathname).toBe(`/groups/${fx.group.id}/edit`);
  });
});

describe('settings', () => {
  const late = () => screen.findByLabelText(tr('settings.late'));

  it('the owner changes the late threshold, with a check on the number', async () => {
    const { user } = await renderAt('/settings');
    const field = await late();
    expect(field).toHaveValue(15);
    await user.clear(field);
    await user.type(field, '121');
    await user.click(screen.getByRole('button', { name: tr('settings.save') }));
    expect(screen.getByText(tr('settings.invalid'))).toBeVisible();
    await user.clear(field);
    await user.click(screen.getByRole('button', { name: tr('settings.save') }));
    expect(screen.getByText(tr('settings.invalid'))).toBeVisible();
    await user.type(field, '5');
    await user.click(screen.getByRole('button', { name: tr('settings.save') }));
    await expect
      .poll(() => body('PUT /api/v1/attendance-settings'))
      .toEqual({ lateAfterMinutes: 5 });
    expect(await screen.findByRole('status')).toHaveTextContent(tr('settings.saved'));
    // Typing again hides "Saved".
    await user.type(field, '0');
    expect(screen.queryByRole('status')).toBeNull();
  });

  it('is read-only for others, shows load and save failures, and sits under More', async () => {
    asRole('teacher');
    await renderAt('/settings', { lang: 'en' });
    expect(await late()).toHaveAttribute('readonly');
    expect(screen.queryByRole('button', { name: tr('settings.save') })).toBeNull();

    server.use(http.get(route('attendance-settings'), fail('FORBIDDEN', 403)));
    await renderAt('/settings');
    expect(await screen.findByRole('alert')).toHaveTextContent(tr('errors.FORBIDDEN'));

    // Under More for the owner only: others can't change it (audit 3 N2).
    const more = await renderAt('/more');
    const nav = await screen.findByRole('navigation', { name: tr('nav.more') });
    expect(within(nav).queryByRole('link', { name: tr('nav.settings') })).toBeNull();
    more.unmount();
    asRole('owner');
    await renderAt('/more');
    expect((await screen.findAllByRole('link', { name: tr('nav.settings') }))[0]).toHaveAttribute(
      'href',
      '/settings',
    );
  });

  it('shows a failed save', async () => {
    server.use(http.put(route('attendance-settings'), fail('FORBIDDEN', 403)));
    const { user } = await renderAt('/settings');
    await late();
    await user.click(screen.getByRole('button', { name: tr('settings.save') }));
    expect(await screen.findByRole('alert')).toHaveTextContent(tr('errors.FORBIDDEN'));
  });
});

describe('room capacity hint', () => {
  it('warns when the group seats more than the room', async () => {
    server.use(
      http.get(route('rooms'), () =>
        Response.json([
          {
            id: '00000000-0000-4000-8000-0000000000c1',
            name: 'قاعة 1',
            capacity: 20,
            status: 'active',
          },
        ]),
      ),
    );
    const { user } = await renderAt('/groups/new');
    await screen.findByRole('button', { name: tr('groups.create') });
    await pick(user, `${tr('groups.room')} ${tr('form.optional')}`, 'قاعة 1');
    const capacity = screen.getByLabelText(`${tr('groups.capacity')} ${tr('form.optional')}`);
    await user.type(capacity, '20');
    expect(screen.queryByRole('note')).toBeNull();
    await user.type(capacity, '5');
    expect(screen.getByRole('note')).toHaveTextContent(
      tr('groups.overRoom', { capacity: 20, room: 'قاعة 1' }),
    );
  });
});
