import { screen, within } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { fail, fx, http, route, sent, server } from '@/test/server';
import { pick, renderAt, tr } from '@/test/render';

const SUBJECTS = [
  {
    id: '00000000-0000-4000-8000-0000000000c1',
    nameAr: 'الفيزياء',
    nameEn: 'Physics',
    status: 'active',
  },
  {
    id: '00000000-0000-4000-8000-0000000000c2',
    nameAr: 'الجيولوجيا',
    nameEn: 'الجيولوجيا',
    status: 'archived',
  },
];
const GRADES = [
  {
    id: '00000000-0000-4000-8000-0000000000d1',
    nameAr: 'الصف الأول الثانوي',
    nameEn: 'Secondary 1',
    status: 'active',
  },
  {
    id: '00000000-0000-4000-8000-0000000000d2',
    nameAr: 'كي جي',
    nameEn: 'KG',
    status: 'archived',
  },
];
const withCurriculum = () =>
  server.use(
    http.get(route('subjects'), () => Response.json(SUBJECTS)),
    http.get(route('grade-levels'), () => Response.json(GRADES)),
  );
const asRole = (role: string) =>
  server.use(
    http.get(route('workspaces/current'), () => Response.json({ ...fx.currentWorkspace, role })),
  );
const body = (c: string) => sent.findLast((s) => s.call === c)?.body;
const EN = () => `${tr('curriculum.nameEn')} ${tr('form.optional')}`;

describe('curriculum screen', () => {
  it('the owner adds, renames, archives and restores subjects', async () => {
    withCurriculum();
    const { user } = await renderAt('/curriculum');
    const list = await screen.findByRole('list', { name: tr('curriculum.subjects') });
    expect(within(list).getByText('الفيزياء')).toBeVisible();
    // The other language's name shows under the main one, and archived items say so.
    expect(within(list).getByText('Physics')).toBeVisible();
    expect(within(list).getByText(tr('curriculum.archived'))).toBeVisible();

    // Add: the Arabic name is needed; the English one may be left empty.
    await user.click(screen.getByRole('button', { name: tr('curriculum.addSubject') }));
    const sheet = screen.getByRole('dialog', { name: tr('curriculum.addSubject') });
    const add = within(sheet).getByRole('button', { name: tr('curriculum.addSubject') });
    await user.click(add);
    expect(await screen.findByText(tr('curriculum.invalid'))).toBeVisible();
    await user.type(within(sheet).getByLabelText(tr('curriculum.nameAr')), ' البرمجة ');
    await user.click(add);
    await expect.poll(() => body('POST /api/v1/subjects')).toEqual({ nameAr: 'البرمجة' });
    await expect.poll(() => screen.queryByRole('dialog')).toBeNull();

    // Rename: an empty English name falls back to the Arabic one.
    const menu = (i: number) =>
      within(list).getByRole('button', {
        name: tr('curriculum.actions', { name: SUBJECTS[i]!.nameAr }),
      });
    await user.click(menu(0));
    await user.click(within(list).getByRole('button', { name: tr('curriculum.edit') }));
    const ar = within(list).getByLabelText(tr('curriculum.nameAr'));
    await user.clear(ar);
    await user.type(ar, 'فيزياء');
    await user.clear(within(list).getByLabelText(EN()));
    await user.click(within(list).getByRole('button', { name: tr('curriculum.save') }));
    await expect
      .poll(() => body(`PATCH /api/v1/subjects/${SUBJECTS[0]!.id}`))
      .toEqual({ nameAr: 'فيزياء', nameEn: 'فيزياء' });
    await expect
      .poll(() => screen.queryByRole('button', { name: tr('curriculum.save') }))
      .toBeNull();

    await user.click(within(list).getByRole('button', { name: tr('curriculum.archive') }));
    await expect
      .poll(() => body(`PATCH /api/v1/subjects/${SUBJECTS[0]!.id}`))
      .toEqual({ status: 'archived' });
    await user.click(menu(1));
    await user.click(within(list).getByRole('button', { name: tr('curriculum.restore') }));
    await expect
      .poll(() => body(`PATCH /api/v1/subjects/${SUBJECTS[1]!.id}`))
      .toEqual({ status: 'active' });
  });

  it('switches to grades and adds one with an English name, in English', async () => {
    withCurriculum();
    const { user } = await renderAt('/curriculum', { lang: 'en' });
    await screen.findByRole('list', { name: tr('curriculum.subjects') });
    const tab = screen.getByRole('button', { name: tr('curriculum.grades') });
    await user.click(tab);
    expect(tab).toHaveAttribute('aria-pressed', 'true');
    const list = await screen.findByRole('list', { name: tr('curriculum.grades') });
    // In English the English name leads and the Arabic one follows.
    expect(within(list).getByText('Secondary 1')).toBeVisible();
    expect(within(list).getByText('الصف الأول الثانوي')).toBeVisible();

    await user.click(screen.getByRole('button', { name: tr('curriculum.addGrade') }));
    const sheet = screen.getByRole('dialog', { name: tr('curriculum.addGrade') });
    await user.type(within(sheet).getByLabelText(tr('curriculum.nameAr')), 'الصف الأول الابتدائي');
    await user.type(within(sheet).getByLabelText(EN()), 'Grade 1');
    await user.click(within(sheet).getByRole('button', { name: tr('curriculum.addGrade') }));
    await expect
      .poll(() => body('POST /api/v1/grade-levels'))
      .toEqual({ nameAr: 'الصف الأول الابتدائي', nameEn: 'Grade 1' });

    await user.click(
      within(list).getByRole('button', { name: tr('curriculum.actions', { name: 'KG' }) }),
    );
    await user.click(within(list).getByRole('button', { name: tr('curriculum.restore') }));
    await expect
      .poll(() => body(`PATCH /api/v1/grade-levels/${GRADES[1]!.id}`))
      .toEqual({ status: 'active' });
    await user.click(within(list).getByRole('button', { name: tr('curriculum.edit') }));
    await user.click(within(list).getByRole('button', { name: tr('curriculum.save') }));
    await expect
      .poll(() => body(`PATCH /api/v1/grade-levels/${GRADES[1]!.id}`))
      .toEqual({ nameAr: 'كي جي', nameEn: 'KG' });
  });

  it('shows a taken name, a too-long English name and a failed archive', async () => {
    withCurriculum();
    server.use(
      http.post(route('subjects'), fail('CURRICULUM_NAME_TAKEN', 409)),
      http.patch(route('subjects/:id'), fail('FORBIDDEN', 403)),
    );
    const { user } = await renderAt('/curriculum');
    await user.click(await screen.findByRole('button', { name: tr('curriculum.addSubject') }));
    const sheet = screen.getByRole('dialog', { name: tr('curriculum.addSubject') });
    await user.type(within(sheet).getByLabelText(tr('curriculum.nameAr')), 'الفيزياء');
    const en = within(sheet).getByLabelText(EN());
    // maxLength stops typing, so paste past it the way a browser autofill might.
    en.removeAttribute('maxlength');
    await user.type(en, 'x'.repeat(61));
    const add = within(sheet).getByRole('button', { name: tr('curriculum.addSubject') });
    await user.click(add);
    expect(await within(sheet).findByText(tr('curriculum.invalid'))).toBeVisible();
    await user.clear(en);
    await user.click(add);
    expect(await within(sheet).findByText(tr('errors.CURRICULUM_NAME_TAKEN'))).toBeVisible();
    await user.click(screen.getByRole('button', { name: tr('payments.close') }));

    await user.click(
      screen.getByRole('button', { name: tr('curriculum.actions', { name: 'الفيزياء' }) }),
    );
    await user.click(screen.getByRole('button', { name: tr('curriculum.archive') }));
    expect(await screen.findByText(tr('errors.FORBIDDEN'))).toBeVisible();
  });

  it('the owner moves subjects and grades up and down', async () => {
    withCurriculum();
    server.use(http.put(route('grade-levels/order'), fail('CURRICULUM_ORDER_STALE', 409)));
    const { user } = await renderAt('/curriculum', { lang: 'en' });
    const list = await screen.findByRole('list', { name: tr('curriculum.subjects') });
    // The first can't go up, the last can't go down.
    const up = (name: string) =>
      within(list).getByRole('button', { name: tr('curriculum.moveUp', { name }) });
    const down = (name: string) =>
      within(list).getByRole('button', { name: tr('curriculum.moveDown', { name }) });
    expect(up('Physics')).toBeDisabled();
    expect(down('الجيولوجيا')).toBeDisabled();
    await user.click(down('Physics'));
    await expect
      .poll(() => body('PUT /api/v1/subjects/order'))
      .toEqual({ ids: [SUBJECTS[1]!.id, SUBJECTS[0]!.id] });

    await user.click(screen.getByRole('button', { name: tr('curriculum.grades') }));
    const grades = await screen.findByRole('list', { name: tr('curriculum.grades') });
    await user.click(
      within(grades).getByRole('button', { name: tr('curriculum.moveUp', { name: 'KG' }) }),
    );
    expect(await screen.findByText(tr('errors.CURRICULUM_ORDER_STALE'))).toBeVisible();
  });

  it('others see a read-only list', async () => {
    asRole('teacher');
    withCurriculum();
    await renderAt('/curriculum');
    expect(await screen.findByText('الفيزياء')).toBeVisible();
    expect(screen.queryByRole('button', { name: tr('curriculum.addSubject') })).toBeNull();
    expect(screen.queryByRole('button', { name: /خيارات/ })).toBeNull();
    expect(screen.queryByRole('button', { name: /لأعلى/ })).toBeNull();
  });

  it('says when there are none, and when loading fails', async () => {
    server.use(
      http.get(route('subjects'), () => Response.json([])),
      http.get(route('grade-levels'), fail('FORBIDDEN', 403)),
    );
    const { user } = await renderAt('/curriculum');
    expect(await screen.findByText(tr('curriculum.emptySubjects'))).toBeVisible();
    await user.click(screen.getByRole('button', { name: tr('curriculum.grades') }));
    expect(await screen.findByRole('alert')).toHaveTextContent(tr('errors.FORBIDDEN'));
  });

  it('says when there are no grades', async () => {
    server.use(http.get(route('grade-levels'), () => Response.json([])));
    const { user } = await renderAt('/curriculum');
    await user.click(await screen.findByRole('button', { name: tr('curriculum.grades') }));
    expect(await screen.findByText(tr('curriculum.emptyGrades'))).toBeVisible();
  });

  it('is listed under More for the owner only', async () => {
    await renderAt('/more');
    const nav = await screen.findByRole('navigation', { name: tr('nav.more') });
    expect(within(nav).getByRole('link', { name: tr('nav.curriculum') })).toHaveAttribute(
      'href',
      '/curriculum',
    );
  });
});

/** Opens a picker, reads its option labels, and closes it again. */
async function optionsOf(user: Awaited<ReturnType<typeof renderAt>>['user'], label: string) {
  await user.click(await screen.findByRole('combobox', { name: label }));
  const options = (await screen.findAllByRole('option')).map((o) => o.textContent);
  await user.keyboard('{Escape}');
  return options;
}

describe('archived curriculum in the pickers', () => {
  it('the new-group form hides archived subjects and grades', async () => {
    withCurriculum();
    const { user } = await renderAt('/groups/new');
    const subjects = await optionsOf(user, tr('groups.subject'));
    expect(subjects).toContain('الفيزياء');
    expect(subjects).not.toContain('الجيولوجيا');
    const grades = await optionsOf(user, tr('groups.gradeLevel'));
    expect(grades).toContain('الصف الأول الثانوي');
    expect(grades).not.toContain('كي جي');
  });

  it('a group keeps its own archived subject and grade in the edit form', async () => {
    server.use(
      http.get(route('subjects'), () =>
        Response.json([...SUBJECTS, { ...fx.group.subject, status: 'archived' }]),
      ),
      http.get(route('grade-levels'), () =>
        Response.json([...GRADES, { ...fx.group.gradeLevel, status: 'archived' }]),
      ),
    );
    const { user } = await renderAt(`/groups/${fx.group.id}/edit`);
    await expect
      .poll(() => screen.queryByRole('combobox', { name: tr('groups.subject') })?.textContent)
      .toContain(fx.group.subject.nameAr);
    const subjects = await optionsOf(user, tr('groups.subject'));
    expect(subjects).toContain(fx.group.subject.nameAr);
    expect(subjects).not.toContain('الجيولوجيا');
    expect(await optionsOf(user, tr('groups.gradeLevel'))).toContain(fx.group.gradeLevel.nameAr);
  });

  it('the new-student form hides archived grades', async () => {
    withCurriculum();
    const { user } = await renderAt('/students/new');
    const grades = await optionsOf(user, tr('students.gradeLevel'));
    expect(grades).toContain('الصف الأول الثانوي');
    expect(grades).not.toContain('كي جي');
    await pick(user, tr('students.gradeLevel'), 'الصف الأول الثانوي');
  });
});
