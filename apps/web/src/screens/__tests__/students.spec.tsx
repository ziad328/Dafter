import { screen, within } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { fail, fx, http, route, sent, server } from '@/test/server';
import { pick, renderAt, tr } from '@/test/render';

const student = fx.student;
const page = `/students/${student.id}`;
const call = (c: string) => sent.find((s) => s.call === c);
const groupName = (g: (typeof fx.groups)[number]) =>
  `${g.subject.nameAr} · ${g.gradeLevel.nameAr} · ${g.teacherName}`;

describe('students list', () => {
  it('lists students and searches after typing pauses', async () => {
    const asked: (string | null)[] = [];
    server.use(
      http.get(route('students'), ({ request }) => {
        asked.push(new URL(request.url).searchParams.get('q'));
        return Response.json([
          { ...fx.students[0]!, phone: '01012345678', status: 'archived' },
          ...fx.students.slice(1),
        ]);
      }),
    );
    const { user } = await renderAt('/students');
    expect(await screen.findAllByRole('heading', { level: 2 })).toHaveLength(3);
    expect(screen.getByText('01012345678')).toBeInTheDocument();
    expect(screen.getByText(tr('students.statuses.archived'))).toBeInTheDocument();
    await user.type(screen.getAllByRole('searchbox', { name: tr('students.search') })[1]!, 'نور');
    await expect.poll(() => asked).toContain('نور');
  });

  it('takes the search from the top bar, and says when nothing matches', async () => {
    server.use(http.get(route('students'), () => Response.json([])));
    await renderAt('/students?q=zzz');
    expect(await screen.findByText(tr('students.noResults'))).toBeInTheDocument();
  });

  it('says when there are no students yet, in English', async () => {
    server.use(http.get(route('students'), () => Response.json([])));
    await renderAt('/students', { lang: 'en' });
    expect(await screen.findByText(tr('students.empty'))).toBeInTheDocument();
  });

  it('shows English names, a failed list, and opens the payment sheet', async () => {
    server.use(
      http.get(route('students'), () => Response.json([{ ...fx.students[0]!, nameEn: 'Nour' }])),
    );
    const { user, unmount } = await renderAt('/students', { lang: 'en' });
    expect(await screen.findByRole('heading', { name: 'Nour' })).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: tr('fees.record') }));
    expect(screen.getByRole('dialog', { name: tr('fees.record') })).toHaveAttribute('open');
    await user.click(screen.getByRole('button', { name: tr('payments.close') }));
    unmount();
    server.use(http.get(route('students'), fail('FORBIDDEN', 403)));
    await renderAt('/students');
    expect(await screen.findByRole('alert')).toHaveTextContent(tr('errors.FORBIDDEN'));
  });
});

describe('new student', () => {
  it('validates, then registers, joins the chosen group and opens their page', async () => {
    const { user, router } = await renderAt('/students/new');
    const submit = await screen.findByRole('button', { name: tr('students.create') });
    await user.click(submit);
    expect(await screen.findByText(tr('form.invalid.name'))).toBeInTheDocument();
    expect(call('POST /api/v1/students')).toBeUndefined();

    await user.type(screen.getByLabelText(tr('students.nameAr')), 'سارة علي');
    await user.type(screen.getByLabelText(tr('students.phone')), '٠١٠١٢٣٤٥٦٧٨');
    expect(await screen.findByText(tr('students.duplicatePhone'))).toBeInTheDocument();
    const label = `${tr('enrollments.group')} ${tr('form.optional')}`;
    await pick(user, label, groupName(fx.groups[0]!));
    const discount = screen.getByLabelText(`${tr('enrollments.discount')} ${tr('form.optional')}`);
    await user.type(discount, '150');
    expect(screen.getByText(tr('form.invalid.discount'))).toBeInTheDocument();
    await user.click(submit);
    expect(call('POST /api/v1/students')).toBeUndefined();
    await user.clear(discount);
    await user.type(discount, '10');
    await user.type(screen.getByLabelText(tr('students.guardianPhone')), '01112345678');
    await user.click(screen.getByText(tr('students.more')));
    await user.type(
      screen.getByLabelText(`${tr('students.guardianName')} ${tr('form.optional')}`),
      'علي',
    );
    await pick(user, tr('students.relation'), tr('students.relations.mother'));
    await user.click(submit);

    await expect.poll(() => router.state.location.pathname).toBe(`/students/${student.id}`);
    expect(call('POST /api/v1/students')?.body).toMatchObject({
      nameAr: 'سارة علي',
      phone: '01012345678',
      gradeLevelId: fx.groups[0]!.gradeLevel.id,
      guardian: { phone: '01112345678', name: 'علي', relation: 'mother' },
    });
    expect(call(`POST /api/v1/students/${student.id}/enrollments`)?.body).toEqual({
      groupId: fx.groups[0]!.id,
      discountPct: 10,
    });
  });

  it('opens the page with the enrolment error when joining fails', async () => {
    server.use(
      http.post(route('students/:id/enrollments'), fail('GROUP_NOT_FOUND', 404)),
      http.get(route('students/:id/enrollments'), () => Response.json([])),
    );
    const { user } = await renderAt('/students/new');
    await user.type(await screen.findByLabelText(tr('students.nameAr')), 'سارة');
    await pick(user, `${tr('enrollments.group')} ${tr('form.optional')}`, groupName(fx.groups[0]!));
    await user.type(screen.getByLabelText(tr('students.guardianPhone')), '01112345678');
    await user.click(screen.getByRole('button', { name: tr('students.create') }));
    expect(await screen.findByText(new RegExp(tr('enrollments.notJoined')))).toBeInTheDocument();
  });

  it('registers without a group, and shows a server error', async () => {
    server.use(http.post(route('students'), fail('INTERNAL', 500)));
    const { user } = await renderAt('/students/new');
    await user.type(await screen.findByLabelText(tr('students.nameAr')), 'سارة');
    await pick(user, tr('students.gradeLevel'), fx.gradeLevels[0]!.nameAr);
    await user.type(screen.getByLabelText(tr('students.guardianPhone')), '01112345678');
    await user.click(screen.getByRole('button', { name: tr('students.create') }));
    expect(await screen.findByRole('alert')).toHaveTextContent(tr('errors.INTERNAL'));
  });

  it('opens the new page after registering with no group', async () => {
    const { user, router } = await renderAt('/students/new');
    await user.type(await screen.findByLabelText(tr('students.nameAr')), 'سارة');
    await pick(user, tr('students.gradeLevel'), fx.gradeLevels[0]!.nameAr);
    await user.type(screen.getByLabelText(tr('students.guardianPhone')), '01112345678');
    await user.click(screen.getByRole('button', { name: tr('students.create') }));
    await expect.poll(() => router.state.location.pathname).toBe(page);
    expect(sent.some((s) => s.call.endsWith('/enrollments') && s.call.startsWith('POST'))).toBe(
      false,
    );
  });
});

describe('student page', () => {
  it('shows the summary, edits and saves cleared fields as null', async () => {
    server.use(
      http.get(route('students/:id'), () =>
        Response.json({
          ...student,
          phone: '01012345678',
          status: 'archived',
          guardians: [{ ...student.guardians[0]!, name: 'علي', isPrimary: false }],
        }),
      ),
    );
    const { user } = await renderAt(page);
    expect(await screen.findByRole('heading', { level: 1, name: student.nameAr })).toBeVisible();
    expect(screen.getByText(/علي ·/)).toBeInTheDocument();
    expect(
      screen.getAllByText(new RegExp(tr('students.statuses.archived'))).length,
    ).toBeGreaterThan(0);
    await user.click(screen.getByRole('button', { name: tr('students.edit') }));
    await user.clear(screen.getByLabelText(tr('students.phone')));
    await user.click(screen.getByRole('button', { name: tr('students.save') }));
    await expect
      .poll(() => call(`PATCH /api/v1/students/${student.id}`)?.body)
      .toMatchObject({
        phone: null,
        nameEn: null,
        school: null,
        status: 'archived',
      });
    expect(await screen.findByRole('button', { name: tr('students.edit') })).toBeVisible();
    await user.click(screen.getByRole('button', { name: tr('students.edit') }));
    await user.click(screen.getByRole('button', { name: tr('students.cancelEdit') }));
    expect(screen.queryByRole('button', { name: tr('students.save') })).not.toBeInTheDocument();
  });

  it('shows an English name, and a student with no parent', async () => {
    server.use(
      http.get(route('students/:id'), () =>
        Response.json({ ...student, nameEn: 'Nour', guardians: [] }),
      ),
    );
    const { user } = await renderAt(page, { lang: 'en' });
    expect(await screen.findByRole('heading', { level: 1, name: 'Nour' })).toBeVisible();
    expect(screen.queryByText(tr('students.guardian'))).not.toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: tr('students.edit') }));
    expect(screen.getByLabelText(tr('students.guardianPhone'))).toHaveValue('');
  });

  it('says when the student cannot be loaded', async () => {
    server.use(http.get(route('students/:id'), fail('STUDENT_NOT_FOUND', 404)));
    await renderAt(page);
    expect(await screen.findByRole('alert')).toHaveTextContent(tr('errors.STUDENT_NOT_FOUND'));
  });
});

describe('enrolments', () => {
  it('lists groups with discounts, leaves one and adds another', async () => {
    server.use(
      http.get(route('students/:id/enrollments'), () =>
        Response.json([{ ...fx.enrollments[0]!, discountPct: 20 }]),
      ),
    );
    const { user } = await renderAt(page);
    const card = (await screen.findByRole('heading', { name: tr('enrollments.title') })).closest(
      '[data-slot=card]',
    ) as HTMLElement;
    expect(
      await within(card).findByText(tr('enrollments.discountShort', { pct: 20 })),
    ).toBeInTheDocument();
    await user.click(within(card).getByRole('button', { name: tr('enrollments.leave') }));
    await expect
      .poll(() =>
        call(`DELETE /api/v1/students/${student.id}/enrollments/${fx.enrollments[0]!.id}`),
      )
      .toBeDefined();
    const add = within(card).getByRole('button', { name: tr('enrollments.add') });
    expect(add).toBeDisabled();
    await pick(user, tr('enrollments.group'), groupName(fx.groups[0]!));
    const discount = within(card).getByLabelText(
      `${tr('enrollments.discount')} ${tr('form.optional')}`,
    );
    await user.type(discount, '200');
    expect(within(card).getByText(tr('form.invalid.discount'))).toBeInTheDocument();
    await user.clear(discount);
    await user.type(discount, '5');
    await user.click(add);
    await expect
      .poll(() => call(`POST /api/v1/students/${student.id}/enrollments`)?.body)
      .toEqual({ groupId: fx.groups[0]!.id, discountPct: 5 });
    await expect.poll(() => discount).toHaveValue('');
  });

  it('shows a failed enrolment', async () => {
    server.use(http.post(route('students/:id/enrollments'), fail('ENROLLMENT_EXISTS', 409)));
    const { user } = await renderAt(page);
    await screen.findByRole('heading', { name: tr('enrollments.title') });
    await pick(user, tr('enrollments.group'), groupName(fx.groups[0]!));
    await user.click(screen.getByRole('button', { name: tr('enrollments.add') }));
    expect(await screen.findByText(tr('errors.ENROLLMENT_EXISTS'))).toBeInTheDocument();
  });
});

describe('fees', () => {
  it('shows the balance and entries, and reverses after a confirm', async () => {
    const { user } = await renderAt(page);
    expect(await screen.findByTestId('balance')).toHaveTextContent(tr('fees.owes'));
    const ledger = screen.getByTestId('ledger');
    expect(within(ledger).getByText(tr('fees.reversed'))).toBeInTheDocument();
    expect(within(ledger).getByRole('link', { name: /21/ })).toHaveAttribute(
      'href',
      `/receipts/${fx.ledger.entries[1]!.id}`,
    );
    const reverse = within(ledger).getByRole('button', { name: tr('fees.reverse') });
    await user.click(reverse);
    await user.click(within(ledger).getByRole('button', { name: tr('fees.confirmReverse') }));
    await expect
      .poll(() => call(`POST /api/v1/ledger/${fx.ledger.entries[2]!.id}/reverse`))
      .toBeDefined();
  });

  it('records a payment with a typed amount and method, choosing among groups', async () => {
    server.use(
      http.get(route('students/:id/enrollments'), () =>
        Response.json([
          fx.enrollments[0]!,
          {
            ...fx.enrollments[0]!,
            id: crypto.randomUUID(),
            groupId: fx.groups[1]!.id,
            teacherName: 'منى',
          },
        ]),
      ),
    );
    const { user } = await renderAt(page);
    const amount = await screen.findByLabelText(tr('fees.amount'));
    expect(amount).toHaveValue('');
    await user.type(amount, 'abc');
    expect(screen.getByText(tr('form.invalid.amount'))).toBeInTheDocument();
    await user.clear(amount);
    await user.type(amount, '150.5');
    const fees = screen.getByRole('group', { name: tr('fees.record') });
    await pick(user, tr('fees.method'), tr('fees.methods.instapay'));
    const groupSelect = within(fees).getByRole('combobox', { name: tr('enrollments.group') });
    await user.click(groupSelect);
    await user.click(await screen.findByRole('option', { name: /منى/ }));
    await user.click(within(fees).getByRole('button', { name: tr('fees.save') }));
    await expect
      .poll(() => call('POST /api/v1/payments')?.body)
      .toEqual({
        studentId: student.id,
        groupId: fx.groups[1]!.id,
        amountPiastres: 15050,
        method: 'instapay',
      });
  });

  it('shows a settled balance, a credit, and failures', async () => {
    server.use(
      http.get(route('students/:id/ledger'), () =>
        Response.json({ balancePiastres: 0, entries: [] }),
      ),
      http.post(route('payments'), fail('IDEMPOTENCY_KEY_REUSED', 409)),
    );
    const { user, unmount } = await renderAt(page);
    expect(await screen.findByTestId('balance')).toHaveTextContent(tr('fees.settled'));
    await user.type(screen.getByLabelText(tr('fees.amount')), '10');
    await user.click(screen.getByRole('button', { name: tr('fees.save') }));
    expect(await screen.findByText(tr('errors.IDEMPOTENCY_KEY_REUSED'))).toBeInTheDocument();
    unmount();
    server.use(
      http.get(route('students/:id/ledger'), () =>
        Response.json({
          balancePiastres: -500,
          entries: [{ ...fx.ledger.entries[1]!, method: null, reversedById: null }],
        }),
      ),
      http.post(route('ledger/:id/reverse'), fail('FORBIDDEN', 403)),
    );
    const second = await renderAt(page);
    expect(await screen.findByTestId('balance')).toHaveTextContent(tr('fees.credit'));
    await second.user.click(screen.getByRole('button', { name: tr('fees.reverse') }));
    await second.user.click(screen.getByRole('button', { name: tr('fees.confirmReverse') }));
    expect(await screen.findByText(tr('errors.FORBIDDEN'))).toBeInTheDocument();
  });
});

describe('app access', () => {
  it('makes an activation link and copies it', async () => {
    const { user } = await renderAt(page);
    await user.click(await screen.findByRole('button', { name: tr('studentApp.staff.invite') }));
    expect(await screen.findByTestId('invite-link')).toHaveTextContent(
      '/s/activate/student-invite-token',
    );
    await user.click(screen.getByRole('button', { name: tr('share.copy') }));
    expect(await screen.findByRole('button', { name: tr('share.copied') })).toBeVisible();
  });

  it('resets a bound phone after a confirm, and shows a failure', async () => {
    server.use(
      http.get(route('students/:id'), () =>
        Response.json({ ...student, activated: true, deviceBound: true }),
      ),
      http.delete(route('students/:id/device'), fail('FORBIDDEN', 403)),
    );
    const { user } = await renderAt(page);
    expect(await screen.findByText(tr('studentApp.staff.bound'))).toBeVisible();
    await user.click(screen.getByRole('button', { name: tr('studentApp.staff.reset') }));
    await user.click(screen.getByRole('button', { name: tr('studentApp.staff.resetConfirm') }));
    expect(await screen.findByText(tr('errors.FORBIDDEN'))).toBeInTheDocument();
  });

  it('says an activated student has no phone yet', async () => {
    server.use(
      http.get(route('students/:id'), () => Response.json({ ...student, activated: true })),
    );
    await renderAt(page);
    expect(await screen.findByText(tr('studentApp.staff.noPhone'))).toBeVisible();
  });
});
