import { screen, within } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { weekdayName } from '@/lib/groups';
import { clockLabel } from '@/lib/time';
import { fail, fx, http, route, sent, server } from '@/test/server';
import { pick, renderAt, tr } from '@/test/render';

const ROOMS = [
  { id: '00000000-0000-4000-8000-0000000000b1', name: 'قاعة 1', capacity: 30, status: 'active' },
  {
    id: '00000000-0000-4000-8000-0000000000b2',
    name: 'المعمل',
    capacity: null,
    status: 'archived',
  },
];
const withRooms = () => server.use(http.get(route('rooms'), () => Response.json(ROOMS)));
const asRole = (role: string) =>
  server.use(
    http.get(route('workspaces/current'), () => Response.json({ ...fx.currentWorkspace, role })),
  );
const body = (c: string) => sent.findLast((s) => s.call === c)?.body;
/** A 409 ROOM_BOOKED that still records what was sent (`fail` doesn't). */
const booked =
  (bodies: unknown[], details?: object) =>
  async ({ request }: { request: Request }) => {
    bodies.push(await request.json());
    return Response.json({ code: 'ROOM_BOOKED', details }, { status: 409 });
  };
const CAPACITY = () => `${tr('groups.capacity')} ${tr('form.optional')}`;

describe('rooms screen', () => {
  it('the owner adds, renames and archives rooms', async () => {
    withRooms();
    const { user } = await renderAt('/rooms');
    const list = await screen.findByRole('list', { name: tr('rooms.title') });
    expect(within(list).getByText('قاعة 1')).toBeVisible();
    expect(within(list).getByText(tr('rooms.seats', { count: 30 }))).toBeVisible();
    expect(within(list).getByText(new RegExp(tr('rooms.archived')))).toBeVisible();

    // Add: a name is needed, and the capacity must be a whole number.
    // The form opens in a sheet from the header (audit 3 R3).
    await user.click(screen.getByRole('button', { name: tr('rooms.add') }));
    const sheet = screen.getByRole('dialog', { name: tr('rooms.add') });
    const add = within(sheet).getByRole('button', { name: tr('rooms.add') });
    await user.click(add);
    expect(await screen.findByText(tr('rooms.invalid'))).toBeVisible();
    await user.type(screen.getByLabelText(tr('rooms.name')), ' قاعة 3 ');
    const capacity = screen.getByLabelText(CAPACITY());
    await user.type(capacity, '0');
    await user.click(add);
    expect(screen.getByText(tr('rooms.invalid'))).toBeVisible();
    await user.clear(capacity);
    await user.type(capacity, '25');
    await user.click(add);
    await expect.poll(() => body('POST /api/v1/rooms')).toEqual({ name: 'قاعة 3', capacity: 25 });
    expect(screen.queryByText(tr('rooms.invalid'))).toBeNull();

    // Rename the first room, clearing its capacity.
    await user.click(within(list).getAllByRole('button', { name: tr('rooms.edit') })[0]!);
    const edit = screen.getByLabelText(tr('rooms.name'));
    await user.clear(edit);
    await user.type(edit, 'قاعة 1 أ');
    await user.clear(screen.getByLabelText(CAPACITY()));
    await user.click(screen.getByRole('button', { name: tr('rooms.save') }));
    await expect
      .poll(() => body(`PATCH /api/v1/rooms/${ROOMS[0]!.id}`))
      .toEqual({ name: 'قاعة 1 أ', capacity: null });
    await expect.poll(() => screen.queryByRole('button', { name: tr('rooms.save') })).toBeNull();

    await user.click(within(list).getByRole('button', { name: tr('rooms.archive') }));
    await expect
      .poll(() => body(`PATCH /api/v1/rooms/${ROOMS[0]!.id}`))
      .toEqual({ status: 'archived' });
    await user.click(within(list).getByRole('button', { name: tr('rooms.restore') }));
    await expect
      .poll(() => body(`PATCH /api/v1/rooms/${ROOMS[1]!.id}`))
      .toEqual({ status: 'active' });
  });

  it('shows a taken name and a failed archive, in English', async () => {
    withRooms();
    server.use(
      http.post(route('rooms'), fail('ROOM_NAME_TAKEN', 409)),
      http.patch(route('rooms/:id'), fail('FORBIDDEN', 403)),
    );
    const { user } = await renderAt('/rooms', { lang: 'en' });
    await user.click(await screen.findByRole('button', { name: tr('rooms.add') }));
    const sheet = screen.getByRole('dialog', { name: tr('rooms.add') });
    await user.type(within(sheet).getByLabelText(tr('rooms.name')), 'Room 1');
    await user.click(within(sheet).getByRole('button', { name: tr('rooms.add') }));
    expect(await screen.findByText(tr('errors.ROOM_NAME_TAKEN'))).toBeVisible();
    await user.click(screen.getAllByRole('button', { name: tr('rooms.archive') })[0]!);
    expect(await screen.findByText(tr('errors.FORBIDDEN'))).toBeVisible();
  });

  it('others see a read-only list', async () => {
    asRole('teacher');
    withRooms();
    await renderAt('/rooms');
    expect(await screen.findByText('قاعة 1')).toBeVisible();
    expect(screen.getByText(tr('rooms.noCapacity'), { exact: false })).toBeVisible();
    expect(screen.queryByRole('button', { name: tr('rooms.add') })).toBeNull();
    expect(screen.queryByRole('button', { name: tr('rooms.edit') })).toBeNull();
  });

  it('says when there are none', async () => {
    await renderAt('/rooms');
    expect(await screen.findByText(tr('rooms.empty'))).toBeVisible();
  });

  it('says when loading fails', async () => {
    server.use(http.get(route('rooms'), fail('FORBIDDEN', 403)));
    await renderAt('/rooms');
    expect(await screen.findByRole('alert')).toHaveTextContent(tr('errors.FORBIDDEN'));
  });

  it('is listed under More', async () => {
    await renderAt('/more');
    const nav = await screen.findByRole('navigation', { name: tr('nav.more') });
    expect(within(nav).getByRole('link', { name: tr('nav.rooms') })).toHaveAttribute(
      'href',
      '/rooms',
    );
  });
});

describe('rooms on groups and the timetable', () => {
  it('picks a room for a new group (archived ones hidden), and explains a booked room', async () => {
    withRooms();
    const bodies: unknown[] = [];
    const clash = { weekday: 6, startTime: '16:00', endTime: '17:30' };
    server.use(http.post(route('groups'), booked(bodies, clash)));
    const { user } = await renderAt('/groups/new');
    await screen.findByRole('button', { name: tr('groups.create') });
    await pick(user, tr('groups.subject'), fx.subjects[0]!.nameAr);
    await pick(user, tr('groups.gradeLevel'), fx.gradeLevels[0]!.nameAr);
    await user.click(
      screen.getByRole('combobox', { name: `${tr('groups.room')} ${tr('form.optional')}` }),
    );
    expect(screen.queryByRole('option', { name: 'المعمل' })).toBeNull();
    await user.click(await screen.findByRole('option', { name: 'قاعة 1' }));
    await user.click(screen.getByRole('button', { name: tr('groups.create') }));
    const time = `⁨${clockLabel('16:00', 'ar')} – ${clockLabel('17:30', 'ar')}⁩`;
    expect(
      await screen.findByText(tr('groups.roomBookedAt', { day: weekdayName('ar', 6), time })),
    ).toBeVisible();
    expect(bodies[0]).toMatchObject({ roomId: ROOMS[0]!.id });
  });

  it('keeps an archived room on its group, can clear it, and shows a plain booked error', async () => {
    const bodies: unknown[] = [];
    withRooms();
    server.use(
      http.get(route('groups/:id'), () =>
        Response.json({ ...fx.group, room: { id: ROOMS[1]!.id, name: 'المعمل' } }),
      ),
      http.patch(route('groups/:id'), booked(bodies)),
    );
    const { user } = await renderAt(`/groups/${fx.group.id}`);
    const room = await screen.findByRole('combobox', {
      name: `${tr('groups.room')} ${tr('form.optional')}`,
    });
    expect(room).toHaveTextContent('المعمل');
    await user.click(screen.getByRole('button', { name: tr('groups.save') }));
    expect(await screen.findByText(tr('errors.ROOM_BOOKED'))).toBeVisible();
    expect(bodies[0]).toMatchObject({ roomId: ROOMS[1]!.id });
    await user.click(room);
    await user.click(await screen.findByRole('option', { name: tr('groups.noRoom') }));
    await user.click(screen.getByRole('button', { name: tr('groups.save') }));
    await expect.poll(() => bodies[1]).toMatchObject({ roomId: null });
  });

  it('shows the room on group cards', async () => {
    const room = { id: ROOMS[0]!.id, name: 'قاعة 1' };
    server.use(http.get(route('groups'), () => Response.json([{ ...fx.group, room }])));
    await renderAt('/groups');
    expect(await screen.findByText('قاعة 1')).toBeVisible();
  });

  it('shows the room on timetable rows', async () => {
    const room = { id: ROOMS[0]!.id, name: 'قاعة 1' };
    server.use(
      http.get(route('sessions'), () => Response.json(fx.sessions.map((s) => ({ ...s, room })))),
    );
    await renderAt('/timetable');
    expect((await screen.findAllByText(/· قاعة 1/)).length).toBeGreaterThan(0);
  });
});
