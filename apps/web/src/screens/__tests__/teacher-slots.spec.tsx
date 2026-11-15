import { fireEvent, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { weekdayName } from '@/lib/groups';
import { clockLabel } from '@/lib/time';
import { fx, http, route, server } from '@/test/server';
import { renderAt, tr } from '@/test/render';

/** The first save answers TEACHER_BOOKED; a save with force: true goes through. */
function busyTeacher(group: object = fx.group) {
  const bodies: Record<string, unknown>[] = [];
  server.use(
    http.patch(route('groups/:id'), async ({ request }) => {
      const body = (await request.json()) as Record<string, unknown>;
      bodies.push(body);
      return body.force
        ? Response.json(group)
        : Response.json(
            {
              code: 'TEACHER_BOOKED',
              details: { weekday: 6, startTime: '16:00', endTime: '17:30' },
            },
            { status: 409 },
          );
    }),
  );
  return bodies;
}

describe('teacher double-booking on the group form', () => {
  it('says when the teacher is busy, and saves the form as edited since, with force', async () => {
    const bodies = busyTeacher();
    const { user, router } = await renderAt(`/groups/${fx.group.id}`);
    await user.click(await screen.findByRole('button', { name: tr('groups.save') }));
    const time = `⁨${clockLabel('16:00', 'ar')} – ${clockLabel('17:30', 'ar')}⁩`;
    expect(await screen.findByRole('alert')).toHaveTextContent(
      tr('groups.teacherBusyAt', { day: weekdayName('ar', 6), time }),
    );
    expect(router.state.location.pathname).toBe(`/groups/${fx.group.id}`);

    // Edited after the warning: "Save anyway" sends the new time, not the first try's.
    const [start] = screen.getAllByLabelText(tr('groups.start'));
    fireEvent.change(start!, { target: { value: '08:00' } });
    await user.click(screen.getByRole('button', { name: tr('groups.saveAnyway') }));
    await expect.poll(() => router.state.location.pathname).toBe('/groups');
    expect(bodies.map((b) => b.force)).toEqual([undefined, true]);
    expect((bodies[1]!.slots as { startTime: string }[])[0]!.startTime).toBe('08:00');
  });

  it('restores an archived group anyway after the warning', async () => {
    server.use(
      http.get(route('groups/:id'), () => Response.json({ ...fx.group, status: 'archived' })),
    );
    const bodies = busyTeacher();
    const { user, router } = await renderAt(`/groups/${fx.group.id}`, { lang: 'en' });
    await user.click(await screen.findByRole('button', { name: tr('groups.restore') }));
    await user.click(await screen.findByRole('button', { name: tr('groups.saveAnyway') }));
    await expect.poll(() => router.state.location.pathname).toBe('/groups');
    expect(bodies).toEqual([
      { status: 'active', force: undefined },
      { status: 'active', force: true },
    ]);
  });
});
