import { fireEvent, getDefaultNormalizer, screen, within } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { weekdayName } from '@/lib/groups';
import { formatEgp } from '@/lib/money';
import { addDays, localDate, weekStart } from '@/lib/time';
import { fail, fx, http, route, sent, server } from '@/test/server';
import { filterBy, pick, renderAt, tr } from '@/test/render';

const call = (c: string) => sent.find((s) => s.call === c);
const asRole = (role: string) =>
  server.use(
    http.get(route('workspaces/current'), () => Response.json({ ...fx.currentWorkspace, role })),
  );

describe('groups', () => {
  it('lists groups with their slots, capacity and status, linked for the owner', async () => {
    server.use(
      http.get(route('groups'), () =>
        Response.json([
          { ...fx.group, capacity: 20, status: 'archived' },
          {
            ...fx.group,
            id: crypto.randomUUID(),
            label: 'مجموعة أ',
            slots: [
              { weekday: 2, startTime: '10:00', endTime: '11:00' },
              { weekday: 6, startTime: '12:00', endTime: '13:00' },
              { weekday: 6, startTime: '09:00', endTime: '10:00' },
            ],
          },
        ]),
      ),
    );
    await renderAt('/groups');
    expect(await screen.findByText(tr('groups.archived'))).toBeInTheDocument();
    expect(screen.getByText(tr('groups.seats', { count: 12, capacity: 20 }))).toBeVisible();
    expect(screen.getByText(/· مجموعة أ/)).toBeVisible();
    expect(screen.getAllByText(tr('groups.students', { count: 12 }))).toHaveLength(1);
    // Currency text keeps its no-break space, so compare it uncollapsed.
    const fee = tr('groups.perMonth', { fee: formatEgp(fx.group.monthlyFeePiastres!, 'ar') });
    const exact = { normalizer: getDefaultNormalizer({ collapseWhitespace: false }) };
    // The fee sits in the row's second line, with the slots and the teacher (audit 3 G2).
    expect(screen.getAllByText(new RegExp(fee), exact)).toHaveLength(2);
    expect(screen.getAllByRole('link', { name: new RegExp(fx.group.subject.nameAr) })).toHaveLength(
      2,
    );
    expect(screen.getByRole('link', { name: new RegExp(tr('groups.new')) })).toBeVisible();
  });

  it('shows assistants plain cards, in English', async () => {
    asRole('assistant');
    await renderAt('/groups', { lang: 'en' });
    expect(await screen.findAllByRole('heading', { name: /^Arabic/ })).toHaveLength(
      fx.groups.length,
    );
    expect(screen.queryByRole('link', { name: /Arabic/ })).not.toBeInTheDocument();
    expect(screen.queryByRole('link', { name: new RegExp(tr('groups.new')) })).toBeNull();
  });

  it('filters by teacher and grade, and searches by text', async () => {
    const math = {
      ...fx.group,
      id: crypto.randomUUID(),
      teacherMembershipId: fx.members[1]!.id,
      teacherName: fx.members[1]!.name,
      subject: fx.subjects[2]!,
      gradeLevel: fx.gradeLevels[1]!,
    };
    server.use(http.get(route('groups'), () => Response.json([fx.group, math])));
    const { user } = await renderAt('/groups');
    const cards = async () => (await screen.findAllByRole('heading', { level: 2 })).length;
    expect(await cards()).toBe(2);
    await filterBy(user, tr('groups.teacher'), fx.members[1]!.name);
    expect(await cards()).toBe(1);
    await filterBy(user, tr('groups.teacher'), tr('filters.all'));
    await filterBy(user, tr('groups.gradeLevel'), fx.gradeLevels[0]!.nameAr);
    expect(await cards()).toBe(1);
    await filterBy(user, tr('groups.gradeLevel'), tr('filters.all'));
    const search = screen.getByRole('searchbox', { name: tr('groups.search') });
    await user.type(search, 'رياضيات');
    expect(screen.getByRole('heading', { level: 2 })).toHaveTextContent(fx.subjects[2]!.nameAr);
    await user.clear(search);
    await user.type(search, 'zzz');
    expect(screen.getByText(tr('groups.noMatch'))).toBeVisible();
  });

  it('says when there are none, and when the list fails', async () => {
    server.use(http.get(route('groups'), () => Response.json([])));
    const { unmount } = await renderAt('/groups');
    expect(await screen.findByText(tr('groups.empty'))).toBeInTheDocument();
    unmount();
    server.use(http.get(route('groups'), fail('FORBIDDEN', 403)));
    await renderAt('/groups');
    expect(await screen.findByRole('alert')).toHaveTextContent(tr('errors.FORBIDDEN'));
  });
});

describe('group form', () => {
  it('validates, then creates a group taught by another teacher', async () => {
    const { user, router } = await renderAt('/groups/new');
    const submit = await screen.findByRole('button', { name: tr('groups.create') });
    await user.click(submit);
    expect(await screen.findByText(tr('form.invalid.subject'))).toBeInTheDocument();
    expect(screen.getByText(tr('form.invalid.gradeLevel'))).toBeInTheDocument();

    await pick(user, tr('groups.subject'), fx.subjects[0]!.nameAr);
    await pick(user, tr('groups.gradeLevel'), fx.gradeLevels[0]!.nameAr);
    await pick(user, tr('groups.teacher'), fx.members[1]!.name);
    await user.type(
      screen.getByLabelText(`${tr('groups.label')} ${tr('form.optional')}`),
      ' الصباحية ',
    );
    await user.type(screen.getByLabelText(`${tr('groups.capacity')} ${tr('form.optional')}`), '25');
    const fee = screen.getByLabelText(`${tr('groups.monthlyFee')} ${tr('form.optional')}`);
    await user.type(fee, 'abc');
    await user.click(submit);
    expect(await screen.findByText(tr('form.invalid.amount'))).toBeInTheDocument();
    await user.clear(fee);
    await user.type(fee, '300');

    await user.click(screen.getByRole('button', { name: tr('groups.addSlot') }));
    await user.click(screen.getAllByRole('combobox', { name: tr('groups.day') })[1]!);
    await user.click(await screen.findByRole('option', { name: weekdayName('ar', 0) }));
    await user.click(screen.getAllByRole('button', { name: tr('groups.removeSlot') })[1]!);
    await user.click(submit);

    await expect.poll(() => router.state.location.pathname).toBe('/groups');
    expect(call('POST /api/v1/groups')?.body).toEqual({
      subjectId: fx.subjects[0]!.id,
      gradeLevelId: fx.gradeLevels[0]!.id,
      teacherMembershipId: fx.members[1]!.id,
      label: 'الصباحية',
      capacity: 25,
      monthlyFeePiastres: 30000,
      slots: [{ weekday: 6, startTime: '16:00', endTime: '17:30' }],
    });
  });

  it('saves an unchanged group that has no capacity', async () => {
    const { user, router } = await renderAt(`/groups/${fx.group.id}`);
    await screen.findByRole('combobox', { name: tr('groups.teacher') });
    await user.click(screen.getByRole('button', { name: tr('groups.save') }));
    await expect.poll(() => router.state.location.pathname).toBe('/groups');
    expect(call(`PATCH /api/v1/groups/${fx.group.id}`)?.body).toMatchObject({
      capacity: null,
      label: null,
    });
  });

  it('flags overlapping, reversed and missing slot times', async () => {
    const { user } = await renderAt('/groups/new');
    await screen.findByRole('combobox', { name: tr('groups.teacher') });
    await pick(user, tr('groups.subject'), fx.subjects[0]!.nameAr);
    await pick(user, tr('groups.gradeLevel'), fx.gradeLevels[0]!.nameAr);
    await user.click(await screen.findByRole('button', { name: tr('groups.addSlot') }));
    await user.click(screen.getByRole('button', { name: tr('groups.create') }));
    expect(await screen.findByText(tr('form.invalid.slotOverlap'))).toBeInTheDocument();
    const [start] = screen.getAllByLabelText(tr('groups.start'));
    const [end] = screen.getAllByLabelText(tr('groups.end'));
    fireEvent.change(start!, { target: { value: '18:00' } });
    await user.click(screen.getByRole('button', { name: tr('groups.create') }));
    expect(await screen.findByText(tr('form.invalid.slotOrder'))).toBeInTheDocument();
    fireEvent.change(end!, { target: { value: '' } });
    await user.click(screen.getByRole('button', { name: tr('groups.create') }));
    expect(await screen.findByText(tr('form.invalid.slot'))).toBeInTheDocument();
  });

  it('edits an existing group with its saved fee, and shows a save error', async () => {
    server.use(http.patch(route('groups/:id'), fail('SLOT_OVERLAP_TEACHER', 409)));
    const { user } = await renderAt(`/groups/${fx.group.id}`, { lang: 'en' });
    expect(
      await screen.findByLabelText(`${tr('groups.monthlyFee')} ${tr('form.optional')}`),
    ).toHaveValue('500.00');
    await user.click(screen.getByRole('button', { name: tr('groups.save') }));
    expect(await screen.findByRole('alert')).toBeInTheDocument();
  });

  it('saves an edit, and hides the teacher choice from a teacher', async () => {
    asRole('teacher');
    server.use(
      http.get(route('groups/:id'), () => Response.json({ ...fx.group, monthlyFeePiastres: null })),
    );
    const { user, router } = await renderAt(`/groups/${fx.group.id}`);
    await user.click(await screen.findByRole('button', { name: tr('groups.save') }));
    await expect.poll(() => router.state.location.pathname).toBe('/groups');
    expect(screen.queryByRole('combobox', { name: tr('groups.teacher') })).toBeNull();
  });

  it('says when the group cannot be loaded', async () => {
    server.use(http.get(route('groups/:id'), fail('GROUP_NOT_FOUND', 404)));
    await renderAt(`/groups/${fx.group.id}`);
    expect(await screen.findByRole('alert')).toHaveTextContent(tr('errors.GROUP_NOT_FOUND'));
  });
});

describe('timetable', () => {
  const tz = 'Africa/Cairo';
  const today = localDate(new Date(), tz);
  const at = (date: string, hhmm: string) => new Date(`${date}T${hhmm}:00+02:00`).toISOString();
  const session = (date: string, status: string, extra = {}) => ({
    ...fx.sessions[1]!,
    id: crypto.randomUUID(),
    status,
    startsAt: at(date, '16:00'),
    endsAt: at(date, '17:30'),
    moved: false,
    ...extra,
  });
  const other = addDays(weekStart(today), today === weekStart(today) ? 1 : 0);
  const week = [
    session(other, 'closed', { moved: true }),
    session(today, 'scheduled', { groupLabel: 'مجموعة ب' }),
    session(today, 'open'),
  ];
  const withWeek = (list: unknown[]) =>
    server.use(http.get(route('sessions'), () => Response.json(list)));

  it('shows the week by day, marks today and starts today’s sessions', async () => {
    withWeek(week);
    await renderAt('/timetable');
    expect(
      await screen.findByText(tr('nav.today'), { selector: 'span.rounded-full' }),
    ).toBeVisible();
    expect(screen.getAllByRole('link', { name: tr('timetable.start') })).toHaveLength(2);
    expect(screen.getByText(new RegExp(tr('timetable.moved')))).toBeInTheDocument();
    expect(screen.getByText(new RegExp(tr('timetable.status.closed')))).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: /· مجموعة ب$/ })).toBeInTheDocument();
  });

  it('narrows the week to one teacher or one grade', async () => {
    withWeek([
      session(today, 'scheduled'),
      session(today, 'scheduled', {
        teacherMembershipId: fx.members[0]!.id,
        teacherName: fx.members[0]!.name,
        gradeLevel: fx.gradeLevels[1]!,
      }),
    ]);
    const { user } = await renderAt('/timetable');
    const cards = async () => (await screen.findAllByRole('heading', { level: 3 })).length;
    expect(await cards()).toBe(2);
    await filterBy(user, tr('groups.teacher'), fx.members[0]!.name);
    expect(await cards()).toBe(1);
    await filterBy(user, tr('groups.teacher'), tr('filters.all'));
    await filterBy(user, tr('groups.gradeLevel'), fx.gradeLevels[1]!.nameAr);
    expect(await cards()).toBe(1);
  });

  it('pages between weeks', async () => {
    withWeek([]);
    const { user, router } = await renderAt('/timetable', { lang: 'en' });
    expect(await screen.findByText(tr('timetable.empty'))).toBeVisible();
    await user.click(screen.getByRole('button', { name: tr('timetable.nextWeek') }));
    expect(router.state.location.search).toBe(`?week=${addDays(weekStart(today), 7)}`);
    await user.click(screen.getByRole('button', { name: tr('timetable.prevWeek') }));
    expect(router.state.location.search).toBe('');
    await user.click(screen.getByRole('button', { name: tr('timetable.prevWeek') }));
    await user.click(screen.getByRole('button', { name: tr('timetable.thisWeek') }));
    expect(router.state.location.search).toBe('');
  });

  it('cancels a session after a confirm, or keeps it', async () => {
    withWeek([session(today, 'scheduled')]);
    const { user } = await renderAt('/timetable');
    const menu = await screen.findByRole('button', { name: tr('timetable.actions') });
    await user.click(menu);
    await user.click(menu);
    expect(screen.queryByRole('button', { name: tr('timetable.move') })).toBeNull();
    await user.click(menu);
    await user.click(screen.getByRole('button', { name: tr('timetable.cancel') }));
    await user.click(screen.getByRole('button', { name: tr('timetable.keep') }));
    await user.click(menu);
    await user.click(screen.getByRole('button', { name: tr('timetable.cancel') }));
    await user.click(screen.getByRole('button', { name: tr('timetable.confirmCancel') }));
    await expect.poll(() => sent.some((s) => s.call.endsWith('/cancel'))).toBe(true);
  });

  it('shows a failed cancel', async () => {
    withWeek([session(today, 'scheduled')]);
    server.use(http.post(route('sessions/:id/cancel'), fail('SESSION_NOT_SCHEDULED', 409)));
    const { user } = await renderAt('/timetable');
    await user.click(await screen.findByRole('button', { name: tr('timetable.actions') }));
    await user.click(screen.getByRole('button', { name: tr('timetable.cancel') }));
    await user.click(screen.getByRole('button', { name: tr('timetable.confirmCancel') }));
    expect(await screen.findByRole('alert')).toHaveTextContent(tr('errors.SESSION_NOT_SCHEDULED'));
  });

  it('moves a session, validating the times', async () => {
    const s = session(today, 'scheduled');
    withWeek([s]);
    const { user } = await renderAt('/timetable');
    await user.click(await screen.findByRole('button', { name: tr('timetable.actions') }));
    await user.click(screen.getByRole('button', { name: tr('timetable.move') }));
    const form = screen.getByLabelText(tr('timetable.date')).closest('form')!;
    const end = within(form).getByLabelText(tr('timetable.end'));
    fireEvent.change(end, { target: { value: '15:00' } });
    await user.click(within(form).getByRole('button', { name: tr('timetable.save') }));
    expect(await screen.findByText(tr('form.invalid.slotOrder'))).toBeVisible();
    fireEvent.change(end, { target: { value: '' } });
    fireEvent.change(within(form).getByLabelText(tr('timetable.start')), {
      target: { value: '' },
    });
    fireEvent.change(within(form).getByLabelText(tr('timetable.date')), { target: { value: '' } });
    await user.click(within(form).getByRole('button', { name: tr('timetable.save') }));
    expect(await screen.findByText(tr('form.invalid.date'))).toBeVisible();
    expect(screen.getAllByText(tr('form.invalid.slot'))).toHaveLength(2);
    fireEvent.change(within(form).getByLabelText(tr('timetable.date')), {
      target: { value: today },
    });
    fireEvent.change(within(form).getByLabelText(tr('timetable.start')), {
      target: { value: '18:00' },
    });
    fireEvent.change(end, { target: { value: '19:00' } });
    await user.click(within(form).getByRole('button', { name: tr('timetable.save') }));
    await expect
      .poll(() => call(`PATCH /api/v1/sessions/${s.id}`)?.body)
      .toEqual({
        date: today,
        startTime: '18:00',
        endTime: '19:00',
      });
    await expect.poll(() => screen.queryByLabelText(tr('timetable.date'))).toBeNull();
  });

  it('says when the teacher is booked at the new time', async () => {
    withWeek([session(today, 'scheduled')]);
    server.use(
      http.patch(route('sessions/:id'), () =>
        Response.json(
          {
            code: 'TEACHER_BOOKED',
            details: { date: '2026-11-21', startTime: '16:00', endTime: '17:30' },
          },
          { status: 409 },
        ),
      ),
    );
    const { user } = await renderAt('/timetable', { lang: 'en' });
    await user.click(await screen.findByRole('button', { name: tr('timetable.actions') }));
    await user.click(screen.getByRole('button', { name: tr('timetable.move') }));
    await user.click(screen.getByRole('button', { name: tr('timetable.save') }));
    const alert = await screen.findByRole('alert');
    expect(alert).toHaveTextContent('The teacher has another session on Saturday, November 21');
    expect(alert).toHaveTextContent(/4:00\sPM – 5:30\sPM/);
  });

  it('shows a failed move, and closes the form', async () => {
    withWeek([session(today, 'scheduled')]);
    server.use(http.patch(route('sessions/:id'), fail('SESSION_NOT_SCHEDULED', 409)));
    const { user } = await renderAt('/timetable');
    await user.click(await screen.findByRole('button', { name: tr('timetable.actions') }));
    await user.click(screen.getByRole('button', { name: tr('timetable.move') }));
    await user.click(screen.getByRole('button', { name: tr('timetable.save') }));
    expect(await screen.findByRole('alert')).toHaveTextContent(tr('errors.SESSION_NOT_SCHEDULED'));
    await user.click(screen.getByRole('button', { name: tr('timetable.close') }));
    expect(screen.queryByLabelText(tr('timetable.date'))).toBeNull();
  });

  it('shows a failed week', async () => {
    server.use(http.get(route('sessions'), fail('FORBIDDEN', 403)));
    await renderAt('/timetable');
    expect(await screen.findByRole('alert')).toHaveTextContent(tr('errors.FORBIDDEN'));
  });
});

describe('a group whose teacher was removed', () => {
  it('is flagged on its card and on its form', async () => {
    const gone = { ...fx.groups[0]!, teacherRemoved: true };
    server.use(
      http.get(route('groups'), () => Response.json([gone])),
      http.get(route('groups/:id'), () => Response.json(gone)),
    );
    await renderAt('/groups');
    expect(await screen.findByText(tr('groups.teacherRemoved'))).toBeVisible();
    await renderAt(`/groups/${gone.id}`);
    expect(
      await screen.findByText(tr('groups.teacherRemovedHint', { name: gone.teacherName })),
    ).toBeVisible();
  });
});
