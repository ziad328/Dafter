import { screen, within } from '@testing-library/react';
import { afterEach, describe, expect, it, onTestFinished, vi } from 'vitest';
import { getWorkspaceId } from '@/api/base';
import { fail, fx, http, route, sent, server } from '@/test/server';
import { pick, renderAt, tr } from '@/test/render';

const call = (c: string) => sent.find((s) => s.call === c);
const asRole = (role: string) =>
  server.use(
    http.get(route('workspaces/current'), () => Response.json({ ...fx.currentWorkspace, role })),
  );
const assistant = fx.members.find((m) => m.role === 'assistant')!;
const owner = fx.members.find((m) => m.role === 'owner')!;

afterEach(() => vi.unstubAllGlobals());

describe('staff', () => {
  it('invites a teacher with a link to share', async () => {
    const { user } = await renderAt('/members');
    await screen.findByRole('combobox', { name: tr('members.role') });
    await pick(user, tr('members.role'), tr('roles.teacher'));
    await user.click(screen.getByRole('button', { name: tr('members.createLink') }));
    expect(await screen.findByTestId('staff-invite-link')).toHaveTextContent(
      '/invite/staff-invite-token',
    );
    expect(call('POST /api/v1/invites')?.body).toEqual({ role: 'teacher' });
  });

  it('sets which teachers an assistant works for, and undoes a failed save', async () => {
    const { user } = await renderAt('/members');
    const title = tr('members.editScopes', { name: assistant.name });
    expect(
      await screen.findAllByText(tr('members.worksForList', { names: 'منى حسن' })),
    ).toHaveLength(2);
    expect(screen.queryByRole('checkbox')).toBeNull();
    await user.click(screen.getByRole('button', { name: title }));
    const sheet = screen.getByRole('dialog', { name: title });
    const box = within(sheet).getByRole('checkbox', { name: owner.name });
    await user.click(box);
    await expect
      .poll(() => call(`PUT /api/v1/members/${assistant.id}/scopes`)?.body)
      .toEqual({ teacherMembershipIds: [...assistant.teacherMembershipIds, owner.id] });
    const both = new Intl.ListFormat('ar').format([owner.name, 'منى حسن']);
    expect(screen.getByText(tr('members.worksForList', { names: both }))).toBeVisible();
    server.use(http.put(route('members/:id/scopes'), fail('FORBIDDEN', 403)));
    await user.click(box);
    expect(await within(sheet).findByText(tr('errors.FORBIDDEN'))).toBeVisible();
    expect(box).toBeChecked();
    await user.click(within(sheet).getByRole('button', { name: tr('payments.close') }));
    expect(sheet).not.toHaveAttribute('open');
  });

  it('shows others a read-only list, and failures', async () => {
    asRole('teacher');
    server.use(http.post(route('invites'), fail('FORBIDDEN', 403)));
    const { unmount } = await renderAt('/members');
    expect(await screen.findByRole('heading', { name: assistant.name })).toBeVisible();
    expect(screen.queryByRole('button', { name: tr('members.createLink') })).toBeNull();
    expect(
      screen.queryByRole('button', { name: tr('members.editScopes', { name: assistant.name }) }),
    ).toBeNull();
    unmount();
    server.use(http.get(route('members'), fail('FORBIDDEN', 403)));
    await renderAt('/members');
    expect(await screen.findByRole('alert')).toHaveTextContent(tr('errors.FORBIDDEN'));
  });

  it('searches a big team, and says when an assistant works for no one', async () => {
    const many = Array.from({ length: 11 }, (_, i) => ({
      ...assistant,
      id: crypto.randomUUID(),
      name: `مساعد ${i}`,
      phone: `0100000010${i % 10}`,
      teacherMembershipIds: [],
    }));
    server.use(http.get(route('members'), () => Response.json([owner, ...many])));
    const { user } = await renderAt('/members');
    expect(await screen.findAllByText(tr('members.worksForNone'))).toHaveLength(11);
    await user.type(screen.getByRole('searchbox', { name: tr('members.search') }), 'مساعد 10');
    expect(screen.getAllByRole('heading', { level: 3 })).toHaveLength(1);
  });

  it('makes a one-time password link for a staff member, but not for the owner', async () => {
    const { user } = await renderAt('/members');
    const name = tr('members.resetFor', { name: assistant.name });
    await user.click(await screen.findByRole('button', { name }));
    const sheet = screen.getByRole('dialog', { name });
    await user.click(within(sheet).getByRole('button', { name: tr('members.createResetLink') }));
    expect(await within(sheet).findByTestId('staff-reset-link')).toHaveTextContent(
      '/reset/staff-reset-token',
    );
    expect(call(`POST /api/v1/members/${assistant.id}/password-reset`)).toBeDefined();
    expect(
      screen.queryByRole('button', { name: tr('members.resetFor', { name: owner.name }) }),
    ).toBeNull();
  });

  it('explains when the account is used elsewhere', async () => {
    server.use(http.post(route('members/:id/password-reset'), fail('RESET_NOT_ALLOWED', 409)));
    const { user } = await renderAt('/members', { lang: 'en' });
    const name = tr('members.resetFor', { name: assistant.name });
    await user.click(await screen.findByRole('button', { name }));
    await user.click(screen.getByRole('button', { name: tr('members.createResetLink') }));
    expect(await screen.findByRole('alert')).toHaveTextContent(tr('errors.RESET_NOT_ALLOWED'));
    await user.click(screen.getByRole('button', { name: tr('payments.close') }));
    expect(screen.queryByRole('dialog', { name })).toBeNull();
  });

  it('shows a failed invite', async () => {
    server.use(http.post(route('invites'), fail('FORBIDDEN', 403)));
    const { user } = await renderAt('/members');
    await user.click(await screen.findByRole('button', { name: tr('members.createLink') }));
    expect(await screen.findByRole('alert')).toHaveTextContent(tr('errors.FORBIDDEN'));
  });
});

describe('messages', () => {
  const full = {
    ...fx.messages[0]!,
    id: crypto.randomUUID(),
    status: 'failed',
    guardianName: 'علي',
    locale: 'en',
    body: 'Your child was absent today.',
    attempts: 3,
  };

  it('lists messages, filters by status and toggles a switch', async () => {
    server.use(
      http.get(route('messages'), ({ request }) =>
        Response.json(
          new URL(request.url).searchParams.get('status') === 'sent'
            ? []
            : [
                ...fx.messages,
                full,
                {
                  ...full,
                  id: crypto.randomUUID(),
                  locale: 'ar',
                  status: 'sent',
                  sentAt: new Date().toISOString(),
                },
              ],
        ),
      ),
    );
    const { user } = await renderAt('/messages');
    const log = await screen.findByTestId('message-log');
    // Closed at night: held for quiet hours, and it says so (sendAfter is 06:00Z = 8:00 Cairo).
    expect(
      within(log).getAllByText(tr('messages.heldUntil', { time: '8:00 ص' }).replace(/\s/g, ' ')),
    ).toHaveLength(fx.messages.length);
    expect(within(log).getAllByText(tr('messages.triggers.absence'))).not.toHaveLength(0);
    expect(within(log).getAllByText('علي')).toHaveLength(2);
    expect(within(log).getByText(tr('messages.attempts', { count: 3 }))).toBeVisible();
    expect(within(log).getAllByText(full.body)).toHaveLength(2);
    const absence = screen.getByRole('checkbox', { name: tr('messages.toggles.absence') });
    await user.click(absence);
    await expect
      .poll(() => call('PUT /api/v1/message-settings')?.body)
      .toEqual({
        absence: false,
        sessionChange: true,
      });
    expect(absence).not.toBeChecked();
    await user.click(screen.getByRole('button', { name: tr('messages.status.sent') }));
    expect(await screen.findByText(tr('messages.empty'))).toBeVisible();
  });

  it('puts a switch back when saving fails', async () => {
    server.use(http.put(route('message-settings'), fail('FORBIDDEN', 403)));
    const { user } = await renderAt('/messages', { lang: 'en' });
    const absence = await screen.findByRole('checkbox', { name: tr('messages.toggles.absence') });
    await user.click(absence);
    expect(await screen.findByRole('alert')).toHaveTextContent(tr('errors.FORBIDDEN'));
    expect(absence).toBeChecked();
  });

  it('shows assistants the log only, and a failed log', async () => {
    asRole('assistant');
    server.use(http.get(route('messages'), fail('FORBIDDEN', 403)));
    await renderAt('/messages');
    expect(await screen.findByText(tr('messages.ownerOnly'))).toBeVisible();
    expect(await screen.findByRole('alert')).toHaveTextContent(tr('errors.FORBIDDEN'));
    expect(screen.getAllByRole('checkbox')[0]).toBeDisabled();
  });
});

describe('workspaces', () => {
  const second = { ...fx.workspaces[0]!, id: crypto.randomUUID(), nameEn: null, role: 'teacher' };

  it('skips the list for someone with one workspace', async () => {
    const { router } = await renderAt('/workspaces', { workspace: null });
    await expect.poll(() => router.state.location.pathname).toBe('/');
    expect(getWorkspaceId()).toBe(fx.workspaces[0]!.id);
  });

  it('marks the current workspace and switches to another', async () => {
    server.use(http.get(route('workspaces'), () => Response.json([fx.workspaces[0], second])));
    const { user, router } = await renderAt('/workspaces', { lang: 'en' });
    const current = await screen.findByRole('button', { name: new RegExp('Al-Nour Center') });
    expect(current).toHaveAttribute('aria-current', 'true');
    expect(screen.getByRole('navigation', { name: tr('nav.breadcrumbs') })).toHaveTextContent(
      tr('workspaces.title'),
    );
    await user.click(screen.getByRole('button', { name: new RegExp(second.nameAr) }));
    expect(getWorkspaceId()).toBe(second.id);
    expect(router.state.location.pathname).toBe('/');
  });

  it('creates a workspace, validating the name', async () => {
    const { user, router } = await renderAt('/workspaces');
    await user.click(await screen.findByRole('button', { name: tr('workspaces.create.title') }));
    const sheet = screen.getByRole('dialog');
    await user.click(within(sheet).getByRole('button', { name: tr('workspaces.create.submit') }));
    expect(await within(sheet).findByText(tr('form.invalid.nameAr'))).toBeVisible();
    await user.type(within(sheet).getByLabelText(tr('workspaces.create.nameAr')), 'سنتر الأمل');
    await user.click(within(sheet).getByLabelText(tr('workspaces.create.independent')));
    await user.click(within(sheet).getByRole('button', { name: tr('workspaces.create.submit') }));
    await expect
      .poll(() => call('POST /api/v1/workspaces')?.body)
      .toEqual({
        nameAr: 'سنتر الأمل',
        type: 'independent',
      });
    expect(router.state.location.pathname).toBe('/');
  });

  it('shows a failed create, an empty list and a failed list', async () => {
    server.use(
      http.post(route('workspaces'), fail('INTERNAL', 500)),
      http.get(route('workspaces'), () => Response.json([])),
    );
    const { user, unmount } = await renderAt('/workspaces');
    expect(await screen.findByText(tr('workspaces.empty'))).toBeVisible();
    await user.click(screen.getByRole('button', { name: tr('workspaces.create.title') }));
    await user.type(screen.getByLabelText(tr('workspaces.create.nameAr')), 'سنتر');
    await user.click(screen.getByRole('button', { name: tr('workspaces.create.submit') }));
    expect(await screen.findByRole('alert')).toHaveTextContent(tr('errors.INTERNAL'));
    await user.click(screen.getByRole('button', { name: tr('payments.close') }));
    unmount();
    server.use(http.get(route('workspaces'), fail('FORBIDDEN', 403)));
    await renderAt('/workspaces');
    expect(await screen.findByRole('alert')).toHaveTextContent(tr('errors.FORBIDDEN'));
  });
});

describe('more', () => {
  it('lists the screens that do not fit the tabs, and the account actions', async () => {
    const { user } = await renderAt('/more');
    const nav = await screen.findByRole('navigation', { name: tr('nav.more') });
    expect(within(nav).getByRole('link', { name: tr('nav.phone') })).toHaveAttribute(
      'href',
      '/dev/phone',
    );
    expect(within(nav).getByRole('link', { name: tr('nav.switchWorkspace') })).toContainHTML('svg');
    const main = screen.getByRole('main');
    await user.click(within(main).getByRole('button', { name: tr('shell.darkMode') }));
    expect(document.documentElement).toHaveClass('dark');
    await user.click(within(main).getByRole('button', { name: tr('shell.lightMode') }));
    expect(document.documentElement).not.toHaveClass('dark');
  });
});

describe('fake phone', () => {
  it('groups what was sent by phone', async () => {
    const at = new Date().toISOString();
    server.use(
      http.get(route('dev/phone'), () =>
        Response.json([
          {
            id: '1',
            phone: '01011111111',
            guardianName: 'علي',
            locale: 'ar',
            body: 'غياب',
            sentAt: at,
          },
          {
            id: '2',
            phone: '01011111111',
            guardianName: 'علي',
            locale: 'en',
            body: 'Absent',
            sentAt: at,
          },
          {
            id: '3',
            phone: '01022222222',
            guardianName: null,
            locale: 'ar',
            body: 'إلغاء',
            sentAt: at,
          },
        ]),
      ),
    );
    await renderAt('/dev/phone');
    const phones = await screen.findAllByTestId('fake-phone');
    expect(phones).toHaveLength(2);
    expect(within(phones[0]!).getByText('Absent')).toBeVisible();
    expect(within(phones[0]!).getByText('علي')).toBeVisible();
  });

  it('says when nothing was sent, and when loading fails', async () => {
    const { unmount } = await renderAt('/dev/phone', { lang: 'en' });
    expect(await screen.findByText(tr('phone.empty'))).toBeVisible();
    unmount();
    server.use(http.get(route('dev/phone'), fail('NOT_FOUND', 404)));
    await renderAt('/dev/phone');
    expect(await screen.findByRole('alert')).toBeVisible();
  });
});

describe('receipt', () => {
  const page = `/receipts/${fx.receipt.entry.id}`;

  it('shows a reversed receipt without sharing, and prints', async () => {
    const print = vi.fn();
    vi.stubGlobal('print', print);
    const { user } = await renderAt(page);
    expect(await screen.findByRole('heading', { name: fx.receipt.center.nameAr })).toBeVisible();
    expect(screen.getByRole('status')).toHaveTextContent(tr('receipt.voided'));
    expect(screen.getByText(/200/)).toHaveClass('line-through');
    expect(screen.queryByRole('button', { name: tr('share.copy') })).toBeNull();
    await user.click(screen.getByRole('button', { name: tr('receipt.print') }));
    expect(print).toHaveBeenCalled();
  });

  it('shares a cash receipt through the phone, in English', async () => {
    const share = vi.fn(async () => {});
    Object.defineProperty(navigator, 'share', { value: share, configurable: true });
    onTestFinished(() => void delete (navigator as { share?: unknown }).share);
    server.use(
      http.get(route('ledger/:id/receipt'), () =>
        Response.json({
          ...fx.receipt,
          entry: {
            ...fx.receipt.entry,
            reversedById: null,
            method: null,
            receiptNo: null,
            createdByName: null,
          },
        }),
      ),
    );
    const { user } = await renderAt(page, { lang: 'en' });
    await user.click(await screen.findByRole('button', { name: tr('share.send') }));
    expect(share).toHaveBeenCalledWith({
      text: expect.stringContaining(`Al-Nour Center\n`),
      url: undefined,
    });
    expect(share.mock.calls[0]).toBeDefined();
  });

  it('says when the receipt cannot be loaded', async () => {
    server.use(http.get(route('ledger/:id/receipt'), fail('ENTRY_NOT_FOUND', 404)));
    await renderAt(page);
    expect(await screen.findByRole('alert')).toBeVisible();
  });
});

describe('register', () => {
  it('validates, then registers and goes on', async () => {
    server.use(http.post(route('auth/refresh'), fail('UNAUTHENTICATED', 401)));
    const { user, router } = await renderAt('/register?next=/students', { workspace: null });
    const submit = await screen.findByRole('button', { name: tr('auth.register.submit') });
    expect(screen.getByLabelText(tr('auth.register.password'))).toHaveAccessibleDescription(
      tr('auth.register.passwordHint'),
    );
    await user.type(
      screen.getByLabelText(`${tr('auth.register.email')} ${tr('form.optional')}`),
      'x',
    );
    await user.click(submit);
    expect(await screen.findByText(tr('form.invalid.name'))).toBeVisible();
    expect(screen.getByText(tr('form.invalid.email'))).toBeVisible();
    await user.clear(screen.getByLabelText(`${tr('auth.register.email')} ${tr('form.optional')}`));
    await user.type(screen.getByLabelText(tr('auth.register.name')), 'منى حسن');
    await user.type(screen.getByLabelText(tr('auth.register.phone')), '01000000009');
    await user.type(screen.getByLabelText(tr('auth.register.password')), 'a-long-password');
    await user.click(submit);
    await expect.poll(() => router.state.location.pathname).toBe('/students');
    expect(call('POST /api/v1/auth/register')?.body).toEqual({
      name: 'منى حسن',
      phone: '01000000009',
      password: 'a-long-password',
      locale: 'ar',
    });
  });

  it('shows a taken phone, and links to sign-in', async () => {
    server.use(
      http.post(route('auth/refresh'), fail('UNAUTHENTICATED', 401)),
      http.post(route('auth/register'), fail('PHONE_TAKEN', 409)),
    );
    const { user } = await renderAt('/register', { workspace: null, lang: 'en' });
    expect(await screen.findByRole('link', { name: tr('auth.register.login') })).toHaveAttribute(
      'href',
      '/login?next=%2F',
    );
    await user.type(screen.getByLabelText(tr('auth.register.name')), 'Mona');
    await user.type(screen.getByLabelText(tr('auth.register.phone')), '01000000009');
    await user.type(screen.getByLabelText(tr('auth.register.password')), 'a-long-password');
    await user.click(screen.getByRole('button', { name: tr('auth.register.submit') }));
    expect(await screen.findByRole('alert')).toBeVisible();
  });
});

describe('staff invite link', () => {
  it('asks a signed-out visitor to sign in or register first', async () => {
    server.use(http.post(route('auth/refresh'), fail('UNAUTHENTICATED', 401)));
    await renderAt('/invite/tok', { workspace: null });
    expect(await screen.findByRole('link', { name: tr('auth.register.submit') })).toHaveAttribute(
      'href',
      '/register?next=%2Finvite%2Ftok',
    );
  });

  it('joins and opens the workspace, or shows why not', async () => {
    const { user, router, unmount } = await renderAt('/invite/tok', { workspace: null });
    await user.click(await screen.findByRole('button', { name: tr('invite.join') }));
    await expect.poll(() => router.state.location.pathname).toBe('/');
    expect(getWorkspaceId()).toBe(fx.currentWorkspace.id);
    unmount();
    server.use(http.post(route('invites/:token/accept'), fail('INVITE_EXPIRED', 410)));
    const second = await renderAt('/invite/tok', { workspace: null });
    await second.user.click(await screen.findByRole('button', { name: tr('invite.join') }));
    expect(await screen.findByRole('alert')).toBeVisible();
  });
});

describe('app shell', () => {
  it('searches students from the top bar', async () => {
    const { user, router } = await renderAt('/groups');
    const search = await screen.findByRole('search');
    await user.type(within(search).getByRole('searchbox'), 'نور{Enter}');
    expect(router.state.location.search).toBe(`?q=${encodeURIComponent('نور')}`);
    await user.clear(within(search).getByRole('searchbox'));
    await user.type(within(search).getByRole('searchbox'), '{Enter}');
    expect(router.state.location.pathname).toBe('/students');
    expect(router.state.location.search).toBe('');
  });

  it('switches language and signs out from the sidebar', async () => {
    const { user, router } = await renderAt('/groups');
    const side = await screen.findByRole('complementary');
    await user.click(within(side).getByRole('button', { name: tr('shell.switchLanguage') }));
    expect(document.documentElement.lang).toBe('en');
    await user.click(within(side).getByRole('button', { name: tr('shell.logout') }));
    await expect.poll(() => router.state.location.pathname).toBe('/login');
    expect(call('POST /api/v1/auth/logout')).toBeDefined();
  });

  it('shows the way back on detail screens', async () => {
    const { unmount } = await renderAt(`/groups/${fx.group.id}`);
    const crumbs = await screen.findByRole('navigation', { name: tr('nav.breadcrumbs') });
    expect(await within(crumbs).findByText(fx.group.subject.nameAr)).toBeVisible();
    unmount();
    const next = await renderAt('/groups/new', { lang: 'en' });
    expect(
      await screen.findByRole('navigation', { name: tr('nav.breadcrumbs') }),
    ).toHaveTextContent(tr('groups.new'));
    next.unmount();
    await renderAt('/students/new');
    expect(
      await screen.findByRole('navigation', { name: tr('nav.breadcrumbs') }),
    ).toHaveTextContent(tr('students.new'));
  });

  it('shows English student names in the crumbs', async () => {
    server.use(
      http.get(route('students/:id'), () => Response.json({ ...fx.student, nameEn: 'Nour' })),
    );
    await renderAt(`/students/${fx.student.id}`, { lang: 'en' });
    const crumbs = await screen.findByRole('navigation', { name: tr('nav.breadcrumbs') });
    expect(await within(crumbs).findByText('Nour')).toBeVisible();
  });

  it('keeps the signed-out layout free of sign-out for students', async () => {
    const { user } = await renderAt('/login', { workspace: null });
    await user.click(await screen.findByRole('button', { name: tr('shell.switchLanguage') }));
    expect(document.documentElement.lang).toBe('en');
    await user.click(screen.getByRole('button', { name: tr('shell.logout') }));
    await expect.poll(() => call('POST /api/v1/auth/logout')).toBeDefined();
  });

  it('shows an unexpected sign-in failure instead of the screen', async () => {
    server.use(http.get(route('me'), fail('INTERNAL', 500)));
    await renderAt('/groups');
    expect(await screen.findByRole('alert')).toHaveTextContent(tr('errors.INTERNAL'));
  });
});
