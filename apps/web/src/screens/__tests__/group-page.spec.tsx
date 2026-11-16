import { screen, within } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { formatEgp } from '@/lib/money';
import { fail, fx, http, route, server } from '@/test/server';
import { renderAt, seen, tr } from '@/test/render';

const page = `/groups/${fx.group.id}`;
const asRole = (role: string) =>
  server.use(
    http.get(route('workspaces/current'), () => Response.json({ ...fx.currentWorkspace, role })),
  );

describe('group page (audit 3 G1)', () => {
  it('shows the roster with who owes and who has not activated, next classes and exams', async () => {
    const [scheduled, open, closed] = [fx.sessions[1]!, fx.sessions[0]!, fx.sessions[2]!];
    server.use(
      http.get(route('sessions'), () =>
        Response.json([
          { ...open, groupId: fx.group.id },
          { ...scheduled, groupId: fx.group.id },
          { ...closed, groupId: fx.group.id },
          { ...scheduled, id: crypto.randomUUID(), groupId: crypto.randomUUID() },
        ]),
      ),
    );
    const { user, router } = await renderAt(page);
    const roster = await screen.findByRole('region', {
      name: tr('groups.students', { count: fx.students.length }),
    });
    const owing = fx.students.find((s) => s.balancePiastres > 0)!;
    const row = within(roster).getByRole('link', { name: new RegExp(owing.nameAr) });
    expect(seen(row.textContent!)).toContain(seen(formatEgp(owing.balancePiastres, 'ar')));
    expect(row).toHaveTextContent(tr('groups.notActivated'));

    // Only this group's classes that are still to come: the open one and the scheduled one.
    const next = screen.getByRole('region', { name: tr('groups.nextClasses') });
    expect(within(next).getAllByRole('listitem')).toHaveLength(2);

    const exams = screen.getByRole('region', { name: tr('exams.title') });
    expect(within(exams).getByRole('link', { name: /امتحان قديم/ })).toBeVisible();

    await user.click(screen.getByRole('link', { name: tr('groups.editShort') }));
    expect(router.state.location.pathname).toBe(`${page}/edit`);
  });

  it('shows empty sections in English, without Edit for an assistant', async () => {
    asRole('assistant');
    server.use(
      http.get(route('students'), () => Response.json([])),
      http.get(route('sessions'), () => Response.json([])),
      http.get(route('groups/:id/exams'), () => Response.json([])),
    );
    await renderAt(page, { lang: 'en' });
    expect(await screen.findByText(tr('groups.noStudents'))).toBeVisible();
    expect(screen.getByText(tr('groups.noNextClasses'))).toBeVisible();
    expect(screen.getByText(tr('groups.noExams'))).toBeVisible();
    expect(screen.queryByRole('link', { name: tr('groups.editShort') })).toBeNull();
  });

  it('names the group in the breadcrumbs of its edit and exams pages', async () => {
    const { unmount } = await renderAt(`${page}/edit`);
    const crumbs = await screen.findByRole('navigation', { name: tr('nav.breadcrumbs') });
    expect(
      await within(crumbs).findByRole('link', { name: fx.group.subject.nameAr }),
    ).toHaveAttribute('href', page);
    expect(within(crumbs).getByText(tr('groups.editShort'))).toBeVisible();
    unmount();
    await renderAt(`${page}/exams`);
    const again = await screen.findByRole('navigation', { name: tr('nav.breadcrumbs') });
    expect(within(again).getByText(tr('exams.title'))).toBeVisible();
  });

  it('shows the error when the group is gone', async () => {
    server.use(http.get(route('groups/:id'), fail('GROUP_NOT_FOUND', 404)));
    await renderAt(page);
    expect(await screen.findByRole('alert')).toHaveTextContent(tr('errors.GROUP_NOT_FOUND'));
  });
});
