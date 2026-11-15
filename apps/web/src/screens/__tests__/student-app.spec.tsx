import { act, screen, within } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { idb } from '@/test/idb';
import { fail, fx, http, route, sent, server } from '@/test/server';
import { renderAt, tr } from '@/test/render';

// The camera library: the test plays the scanner, handing over decoded text.
const scanner = vi.hoisted(() => ({
  onResult: undefined as ((r: { getText: () => string } | undefined) => void) | undefined,
  stop: () => {},
  cameras: [] as { deviceId: string; label: string }[],
}));
vi.mock('@zxing/browser', () => ({
  BrowserQRCodeReader: class {
    static listVideoInputDevices = async () => scanner.cameras;
    async decodeFromStream(_s: unknown, _v: unknown, cb: typeof scanner.onResult) {
      scanner.onResult = cb;
      return { stop: () => scanner.stop() };
    }
  },
}));

const token = 'b'.repeat(32);
const call = (c: string) => sent.find((s) => s.call === c);
const installed = () => localStorage.setItem('dafter.devInstalled', '1');
const signedOut = () => server.use(http.post(route('auth/refresh'), fail('UNAUTHENTICATED', 401)));

const stream = (deviceId = 'back') => {
  const track = { stop: vi.fn(), getSettings: () => ({ deviceId }) };
  return { getTracks: () => [track], getVideoTracks: () => [track], track };
};
let getUserMedia = vi.fn();
beforeEach(() => {
  getUserMedia = vi.fn(async (c: { video: { deviceId?: { exact: string } } }) =>
    stream(c.video.deviceId?.exact),
  );
  Object.defineProperty(navigator, 'mediaDevices', {
    value: { getUserMedia: (c: never) => getUserMedia(c) },
    configurable: true,
  });
  scanner.cameras = [];
  scanner.onResult = undefined;
});
afterEach(() => {
  idb.clear();
  vi.restoreAllMocks();
});

describe('student sign-in', () => {
  it('in a browser tab, shows how to install and keeps the invite link ready to copy', async () => {
    signedOut();
    const { user } = await renderAt(`/s/activate/${token}`, { workspace: null });
    expect(await screen.findByText(tr('install.title'))).toBeVisible();
    expect(screen.getByTestId('install-steps')).toHaveTextContent(tr('install.steps.menu'));
    expect(localStorage.getItem('dafter.invite')).toBe(token);
    const prompt = vi.fn(async () => {});
    act(() => {
      window.dispatchEvent(Object.assign(new Event('beforeinstallprompt'), { prompt }));
    });
    await user.click(screen.getByRole('button', { name: tr('install.button') }));
    expect(prompt).toHaveBeenCalled();
    await user.click(screen.getByRole('button', { name: tr('install.copyLink') }));
    expect(await screen.findByRole('button', { name: tr('install.copied') })).toBeVisible();
  });

  it('shows iPhone steps', async () => {
    signedOut();
    vi.spyOn(navigator, 'userAgent', 'get').mockReturnValue('iPhone');
    await renderAt('/s/login', { workspace: null, lang: 'en' });
    expect(await screen.findByTestId('install-steps')).toHaveTextContent(
      tr('install.steps.iosShare'),
    );
  });

  it('activates with the saved invite: email, then the code, then home', async () => {
    signedOut();
    installed();
    localStorage.setItem('dafter.invite', token);
    const { user, router } = await renderAt('/s/login', { workspace: null });
    expect(await screen.findByText(tr('studentApp.activateTitle'))).toBeVisible();
    const send = screen.getByRole('button', { name: tr('studentApp.sendCode') });
    await user.type(screen.getByLabelText(tr('studentApp.email')), 'nope');
    await user.click(send);
    expect(await screen.findByText(tr('form.invalid.email'))).toBeVisible();
    await user.clear(screen.getByLabelText(tr('studentApp.email')));
    await user.type(screen.getByLabelText(tr('studentApp.email')), ' sara@example.com ');
    await user.click(send);
    expect(await screen.findByRole('note')).toHaveTextContent(tr('studentApp.checkSpam'));
    expect(call('POST /api/v1/auth/otp/request')?.body).toEqual({
      email: 'sara@example.com',
      inviteToken: token,
    });
    await user.click(screen.getByRole('button', { name: tr('studentApp.changeEmail') }));
    await user.type(screen.getByLabelText(tr('studentApp.email')), 'sara@example.com');
    await user.click(screen.getByRole('button', { name: tr('studentApp.sendCode') }));
    const verify = await screen.findByRole('button', { name: tr('studentApp.verify') });
    await user.click(verify);
    expect(await screen.findByText(tr('form.invalid.code'))).toBeVisible();
    await user.type(screen.getByLabelText(tr('studentApp.code')), '١٢٣٤٥٦');
    await user.click(verify);
    await expect.poll(() => router.state.location.pathname).toBe('/s');
    expect(call('POST /api/v1/auth/otp/verify')?.body).toEqual({
      email: 'sara@example.com',
      code: '123456',
      inviteToken: token,
    });
    expect(localStorage.getItem('dafter.invite')).toBeNull();
  });

  it('forgets a dead invite, and shows a wrong code', async () => {
    signedOut();
    installed();
    server.use(
      http.post(route('auth/otp/request'), fail('INVITE_INVALID', 400)),
      http.post(route('auth/otp/verify'), fail('OTP_INVALID', 400)),
    );
    const { user } = await renderAt(`/s/activate/${token}`, { workspace: null });
    await user.type(await screen.findByLabelText(tr('studentApp.email')), 'sara@example.com');
    await user.click(screen.getByRole('button', { name: tr('studentApp.sendCode') }));
    expect(await screen.findByRole('alert')).toBeVisible();
    await expect.poll(() => localStorage.getItem('dafter.invite')).toBeNull();
    server.use(http.post(route('auth/otp/request'), () => new Response(null, { status: 204 })));
    await user.click(screen.getByRole('button', { name: tr('studentApp.sendCode') }));
    await user.type(await screen.findByLabelText(tr('studentApp.code')), '123456');
    await user.click(screen.getByRole('button', { name: tr('studentApp.verify') }));
    expect(await screen.findByRole('alert')).toBeVisible();
  });

  it('takes a pasted invite link on later sign-ins', async () => {
    signedOut();
    installed();
    const { user, router } = await renderAt('/s/login', { workspace: null });
    expect(await screen.findByText(tr('studentApp.loginTitle'))).toBeVisible();
    expect(screen.queryByLabelText(tr('install.paste'))).toBeNull();
    await user.click(screen.getByRole('button', { name: tr('install.firstTime') }));
    const paste = screen.getByLabelText(tr('install.paste'));
    await user.type(paste, 'not a link');
    expect(screen.getByText(tr('install.pasteInvalid'))).toBeVisible();
    await user.clear(paste);
    await user.type(paste, `https://x.test/s/activate/${token}`);
    await user.click(screen.getByRole('button', { name: tr('install.activate') }));
    expect(router.state.location.pathname).toBe(`/s/activate/${token}`);
  });

  it('sends a signed-out student from home to sign in', async () => {
    signedOut();
    const { router } = await renderAt('/s', { workspace: null });
    await expect.poll(() => router.state.location.pathname).toBe('/s/login');
  });
});

describe('student home', () => {
  it('binds the phone, then offers Scan, the next class, the schedule and history', async () => {
    installed();
    await renderAt('/s', { workspace: null });
    expect(
      await screen.findByRole('heading', { name: tr('studentApp.welcome', { name: fx.me.name }) }),
    ).toBeVisible();
    expect(await screen.findByRole('link', { name: tr('scan.open') })).toHaveAttribute(
      'href',
      '/s/scan',
    );
    expect(call('POST /api/v1/devices/bind')?.body).toMatchObject({
      publicKey: expect.any(String),
    });
    expect(screen.getByRole('region', { name: tr('today.next') })).toHaveTextContent(
      `${fx.mySchedule[0]!.subject.nameAr} · مجموعة أ`,
    );
    const schedule = screen.getByTestId('my-schedule');
    expect(within(schedule).getByText(/ · مجموعة أ · /)).toBeVisible();
    expect(within(schedule).getByText(tr('studentApp.today'))).toBeVisible();
    expect(within(schedule).getByText(tr('timetable.status.cancelled'))).toBeVisible();
    expect(screen.getByTestId('attendance-rate')).toHaveTextContent(
      tr('studentApp.rate', { attended: 2, total: 3 }),
    );
  });

  it('says the student is bound to another phone', async () => {
    server.use(http.post(route('devices/bind'), fail('DEVICE_ALREADY_BOUND', 409)));
    await renderAt('/s', { workspace: null, lang: 'en' });
    expect(await screen.findByText(tr('studentApp.bindErrors.otherPhone'))).toBeVisible();
  });

  it('says binding failed, and shows empty lists', async () => {
    server.use(
      http.post(route('devices/bind'), fail('INTERNAL', 500)),
      http.get(route('me/schedule'), () => Response.json([])),
      http.get(route('me/attendance'), () => Response.json([])),
      http.get(route('me/grades'), () => Response.json([])),
    );
    await renderAt('/s', { workspace: null });
    expect(await screen.findByText(tr('studentApp.bindErrors.failed'))).toBeVisible();
    expect(screen.getByText(tr('studentApp.noSessions'))).toBeVisible();
    expect(screen.getByText(tr('studentApp.noHistory'))).toBeVisible();
    expect(await screen.findByText(tr('studentApp.noGrades'))).toBeVisible();
  });

  it('shows my grades: a score out of the max, or absent', async () => {
    await renderAt('/s', { workspace: null, lang: 'en' });
    const list = await screen.findByTestId('my-grades');
    expect(within(list).getByText('18/20')).toBeVisible();
    expect(within(list).getByText('Absent')).toBeVisible();
    expect(within(list).getByText('امتحان 1')).toBeVisible();
    // Let the bind finish: its promise is shared with the next test's render.
    expect(await screen.findByRole('link', { name: tr('scan.open') })).toBeVisible();
  });

  it('fails binding when the key cannot be stored, and hides a rate of only excused classes', async () => {
    idb.failNext();
    server.use(
      http.get(route('me/attendance'), () =>
        Response.json([{ ...fx.myAttendance[2]!, center: { nameAr: 'س', nameEn: 'C' } }]),
      ),
      http.get(route('me/schedule'), () =>
        Response.json([{ ...fx.mySchedule[2]!, center: { nameAr: 'س', nameEn: 'Center' } }]),
      ),
    );
    await renderAt('/s', { workspace: null, lang: 'en' });
    expect(await screen.findByText(tr('studentApp.bindErrors.failed'))).toBeVisible();
    expect(screen.queryByTestId('attendance-rate')).toBeNull();
    expect(screen.getByTestId('my-schedule')).toHaveTextContent('Center');
  });

  it('signs out from settings after a confirm', async () => {
    const { user, router } = await renderAt('/s', { workspace: null });
    await user.click(await screen.findByText(tr('studentApp.settings')));
    await user.click(screen.getByRole('button', { name: tr('shell.logout') }));
    await user.click(screen.getByRole('button', { name: tr('studentApp.confirmLogout') }));
    await expect.poll(() => router.state.location.pathname).toBe('/s/login');
  });
});

describe('scan', () => {
  const code = `${fx.openSession.sessionId}.1.abc`;

  it('scans, signs once per code and confirms', async () => {
    const { user, router } = await renderAt('/s/scan', { workspace: null });
    expect(await screen.findByRole('heading', { name: tr('scan.title') })).toBeVisible();
    await expect.poll(() => scanner.onResult).toBeDefined();
    expect(getUserMedia).toHaveBeenCalledWith({ video: { facingMode: 'environment' } });
    act(() => {
      scanner.onResult!(undefined);
      scanner.onResult!({ getText: () => code });
      scanner.onResult!({ getText: () => code });
    });
    await act(() => window.__dafterScan!(code));
    expect(await screen.findByRole('status')).toHaveTextContent(tr('scan.done.present'));
    expect(sent.filter((s) => s.call === 'POST /api/v1/check-ins')).toHaveLength(1);
    expect(call('POST /api/v1/check-ins')?.body).toMatchObject({
      code,
      signature: expect.any(String),
    });
    await user.click(screen.getByRole('link', { name: tr('scan.back') }));
    expect(router.state.location.pathname).toBe('/s');
  });

  it('asks to scan again when the code expired, and shows other errors', async () => {
    server.use(http.post(route('check-ins'), fail('CHECKIN_CODE_EXPIRED', 409)));
    await renderAt('/s/scan', { workspace: null });
    await expect.poll(() => scanner.onResult).toBeDefined();
    act(() => scanner.onResult!({ getText: () => code }));
    expect(await screen.findByText(tr('scan.again'))).toBeVisible();
    server.use(http.post(route('check-ins'), fail('NOT_ENROLLED', 403)));
    act(() => scanner.onResult!({ getText: () => `${code}2` }));
    await expect.poll(() => screen.getByRole('alert').textContent).not.toBe(tr('scan.again'));
  });

  it('says when the camera is blocked', async () => {
    getUserMedia = vi.fn(async () => {
      throw new Error('denied');
    });
    await renderAt('/s/scan', { workspace: null, lang: 'en' });
    expect(await screen.findByText(tr('scan.cameraBlocked'))).toBeVisible();
  });

  it('switches between cameras and remembers the choice', async () => {
    scanner.cameras = [
      { deviceId: 'back', label: 'Back' },
      { deviceId: 'front', label: 'Front' },
    ];
    const { user } = await renderAt('/s/scan', { workspace: null });
    await user.click(await screen.findByRole('button', { name: tr('scan.switchCamera') }));
    await expect
      .poll(() => getUserMedia.mock.calls.at(-1)?.[0])
      .toEqual({ video: { deviceId: { exact: 'front' } } });
    expect(localStorage.getItem('dafter.camera')).toBe('front');
  });

  it('falls back to the back camera when the saved one is gone, despite blocked storage', async () => {
    localStorage.setItem('dafter.camera', 'gone');
    getUserMedia = vi.fn(async (c: { video: { deviceId?: unknown } }) => {
      if (c.video.deviceId) throw new Error('gone');
      return stream();
    });
    scanner.cameras = [
      { deviceId: 'back', label: 'Back' },
      { deviceId: 'front', label: 'Front' },
    ];
    const { user } = await renderAt('/s/scan', { workspace: null });
    await expect
      .poll(() => getUserMedia.mock.calls.at(-1)?.[0])
      .toEqual({ video: { facingMode: 'environment' } });
    vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
      throw new Error('blocked');
    });
    await user.click(await screen.findByRole('button', { name: tr('scan.switchCamera') }));
    await expect
      .poll(() => getUserMedia)
      .toHaveBeenCalledWith({ video: { deviceId: { exact: 'front' } } });
  });

  it('starts with the back camera when storage is blocked', async () => {
    vi.spyOn(Storage.prototype, 'getItem').mockImplementation(() => {
      throw new Error('blocked');
    });
    await renderAt('/s/scan', { workspace: null });
    await expect.poll(() => getUserMedia).toHaveBeenCalled();
  });

  it('stops the camera when leaving before or after it starts', async () => {
    let resolve!: (s: unknown) => void;
    const late = stream();
    getUserMedia = vi.fn(() => new Promise((r) => (resolve = r)));
    const first = await renderAt('/s/scan', { workspace: null });
    await expect.poll(() => getUserMedia).toHaveBeenCalled();
    first.unmount();
    resolve(late);
    await expect.poll(() => late.track.stop).toHaveBeenCalled();

    const stop = vi.fn();
    scanner.stop = stop;
    getUserMedia = vi.fn(async () => stream());
    const second = await renderAt('/s/scan', { workspace: null });
    await expect.poll(() => scanner.onResult).toBeDefined();
    second.unmount();
    expect(stop).toHaveBeenCalled();
  });
});
