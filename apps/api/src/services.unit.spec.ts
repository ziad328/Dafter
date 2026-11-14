import { generateKeyPairSync } from 'node:crypto';
import { firstValueFrom, take, toArray } from 'rxjs';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { SessionAttendanceController } from './attendance/attendance.controller.js';
import { AttendanceService } from './attendance/attendance.service.js';
import { qrCode, sessionKey, windowAt } from './attendance/qr.js';
import { FakeClock } from './clock.js';
import { AppError } from './errors.js';
import { OutboxSender } from './messages/outbox-sender.js';
import { render } from './messages/templates.js';
import { MoneyService } from './money/money.service.js';
import { SessionsService } from './sessions/sessions.service.js';
import { ConsoleMailer, DevMailController } from './student-auth/mailer.js';
import { StudentAuthService } from './student-auth/student-auth.service.js';
import { StudentsService } from './students/students.service.js';

/**
 * Branches the integration suites can't reach without a race or a broken database: each service
 * is built by hand around stubbed collaborators.
 */
const ctx = { workspaceId: 'ws', userId: 'u', role: 'owner' } as never;
const clock = new FakeClock(new Date('2026-11-24T16:00:05Z'));
// A collaborator with only the methods a test needs.
const stub = (o: object) => o as never;
const code = (c: string) => expect.objectContaining({ code: c });
const notFound = (c: string) => Promise.reject(new AppError(c as never));

afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllEnvs();
});

describe('AttendanceService', () => {
  const make = (repo: object) =>
    new AttendanceService(
      repo as never,
      stub({ get: async () => ({}) }),
      clock,
      stub({ afterCommit: async () => {} }),
    );

  it('refuses to open a session that is no longer scheduled', async () => {
    vi.stubEnv('QR_SECRET', 'secret');
    const service = make({ open: async () => false });
    await expect(service.open(ctx, 'id')).rejects.toEqual(code('SESSION_NOT_SCHEDULED'));
  });

  it('treats a stored key that is not a valid SPKI as a bad signature', async () => {
    vi.stubEnv('QR_SECRET', 'secret');
    const sessionId = '0b2a6f1e-6c1d-4a7e-9a1b-2c3d4e5f6a7b';
    const text = qrCode(
      sessionKey('secret', sessionId),
      sessionId,
      windowAt(clock.now().getTime()),
    );
    const service = make({ activeDevice: async () => ({ id: 'd', publicKey: 'not-a-key' }) });
    await expect(service.checkIn('u', { code: text, signature: 'AA' })).rejects.toEqual(
      code('DEVICE_SIGNATURE_INVALID'),
    );
  });
});

describe('SessionAttendanceController.live', () => {
  it('sends a ping every 25 s next to the records', async () => {
    vi.useFakeTimers();
    const { NEVER } = await import('rxjs');
    const controller = new SessionAttendanceController(stub({ liveFeed: () => NEVER }));
    const pings = firstValueFrom(controller.live(ctx, 'id').pipe(take(2), toArray()));
    await vi.advanceTimersByTimeAsync(50_000);
    expect(await pings).toEqual([
      { type: 'ping', data: '' },
      { type: 'ping', data: '' },
    ]);
  });
});

describe('SessionsService.cancel', () => {
  it('refuses when the session left "scheduled" between the check and the update', async () => {
    const service = new SessionsService(
      stub({ cancel: async () => false }),
      stub({}),
      clock,
      stub({}),
    );
    vi.spyOn(service as never as { writable: () => Promise<void> }, 'writable').mockResolvedValue();
    await expect(service.cancel(ctx, 'id')).rejects.toEqual(code('SESSION_NOT_SCHEDULED'));
  });
});

describe('MoneyService.reverse', () => {
  const make = (groups: object) =>
    new MoneyService(stub({ entry: async () => ({ groupId: 'g' }) }), groups as never);

  it('hides an entry of a group the caller cannot see', async () => {
    const service = make({ get: () => notFound('GROUP_NOT_FOUND') });
    await expect(service.reverse(ctx, 'id', 'idem-key-123')).rejects.toEqual(
      code('ENTRY_NOT_FOUND'),
    );
  });

  it('passes other errors through', async () => {
    const boom = new Error('db down');
    const service = make({ get: () => Promise.reject(boom) });
    await expect(service.reverse(ctx, 'id', 'idem-key-123')).rejects.toBe(boom);
  });
});

describe('StudentsService', () => {
  const make = (groups: object, repo: object = {}) =>
    new StudentsService(repo as never, groups as never, clock);

  it('does not enroll into an archived group', async () => {
    const service = make({ get: async () => ({ id: 'g', status: 'archived' }) });
    vi.spyOn(service, 'get').mockResolvedValue({} as never);
    await expect(service.enroll(ctx, 's', { groupId: 'g' })).rejects.toEqual(
      code('STUDENT_REFERENCE_INVALID'),
    );
  });

  it('hides an enrolment in a group the caller cannot see, and passes other errors', async () => {
    const enrollment = { groupId: 'g' };
    const hidden = make({ get: () => notFound('GROUP_NOT_FOUND') });
    vi.spyOn(hidden as never as { enrollment: () => unknown }, 'enrollment').mockResolvedValue(
      enrollment,
    );
    await expect(hidden.leave(ctx, 's', 'e')).rejects.toEqual(code('ENROLLMENT_NOT_FOUND'));

    const boom = new Error('db down');
    const broken = make({ get: () => Promise.reject(boom) });
    vi.spyOn(broken as never as { enrollment: () => unknown }, 'enrollment').mockResolvedValue(
      enrollment,
    );
    await expect(broken.leave(ctx, 's', 'e')).rejects.toBe(boom);
  });
});

describe('StudentAuthService.bindDevice', () => {
  it('passes through a database error that is not a duplicate', async () => {
    const { publicKey } = generateKeyPairSync('ec', { namedCurve: 'prime256v1' });
    const spki = publicKey.export({ format: 'der', type: 'spki' }).toString('base64url');
    const boom = new Error('db down');
    const service = new StudentAuthService(
      stub({ isStudent: async () => true, bindDevice: () => Promise.reject(boom) }),
      stub({}),
      new ConsoleMailer(),
      clock,
    );
    await expect(service.bindDevice('u', { publicKey: spki, label: 'phone' })).rejects.toBe(boom);
  });
});

describe('OutboxSender.afterCommit', () => {
  it('logs a failed inline send instead of failing the request', async () => {
    vi.stubEnv('OUTBOX_SEND_INLINE', '1');
    const db = new Proxy({}, { get: () => () => Promise.reject(new Error('db down')) });
    const sender = new OutboxSender(db as never, clock);
    const log = vi
      .spyOn((sender as never as { logger: { error: () => void } }).logger, 'error')
      .mockImplementation(() => {});
    await expect(sender.afterCommit('ws')).resolves.toBeUndefined();
    expect(log).toHaveBeenCalled();
  });
});

describe('templates', () => {
  it('writes the English cancellation, falling back to the Arabic center name', () => {
    const text = render(
      'session_cancelled',
      {
        centerAr: 'سنتر النور',
        centerEn: null,
        subjectAr: 'الفيزياء',
        subjectEn: 'Physics',
        startsAt: '2026-11-24T16:00:00Z',
        timezone: 'Africa/Cairo',
      } as never,
      'en',
    );
    expect(text).toContain('سنتر النور: the Physics session');
    expect(text).toContain('is cancelled');
  });
});

describe('DevMailController', () => {
  it('returns the last code only with DEV_MAIL_INBOX=1 and the console mailer', async () => {
    const mailer = new ConsoleMailer();
    vi.spyOn((mailer as never as { logger: { log: () => void } }).logger, 'log').mockImplementation(
      () => {},
    );
    await mailer.send('a@example.com', 'code 123456');
    const controller = new DevMailController(mailer);
    expect(() => controller.last('a@example.com')).toThrow(AppError);
    vi.stubEnv('DEV_MAIL_INBOX', '1');
    expect(controller.last('a@example.com')).toMatchObject({ text: 'code 123456' });
    expect(() => controller.last()).toThrow(AppError);
  });
});

describe('StudentAuthService', () => {
  const make = (repo: object) =>
    new StudentAuthService(repo as never, stub({}), new ConsoleMailer(), clock);

  it('limits code requests to 5 per email', async () => {
    const service = make({ findUserByEmail: async () => undefined });
    for (let i = 0; i < 5; i++) await service.requestOtp({ email: 'A@example.com' }, '10.0.0.1');
    await expect(service.requestOtp({ email: 'a@example.com' }, '10.0.0.1')).rejects.toEqual(
      code('RATE_LIMITED'),
    );
  });

  it('refuses an invite whose email turned into a staff account during the check', async () => {
    const service = make({
      findInvite: async () => ({ workspaceId: 'ws', nameAr: 'طالب' }),
      transaction: (_ws: string, fn: (tx: unknown) => unknown) => fn({}),
      checkOtp: async () => true,
      findOrCreateStudentUser: async () => ({ id: 'u', passwordHash: 'set' }),
    });
    await expect(
      service.verifyOtp({ email: 'a@example.com', code: '123456', inviteToken: 'x'.repeat(43) }),
    ).rejects.toEqual(code('EMAIL_TAKEN'));
  });
  it('refuses an invite used up by a parallel activation', async () => {
    const service = make({
      findInvite: async () => ({ workspaceId: 'ws', nameAr: 'طالب' }),
      transaction: (_ws: string, fn: (tx: unknown) => unknown) => fn({}),
      checkOtp: async () => true,
      findOrCreateStudentUser: async () => ({ id: 'u', passwordHash: null }),
      activate: async () => false,
    });
    await expect(
      service.verifyOtp({ email: 'a@example.com', code: '123456', inviteToken: 'x'.repeat(43) }),
    ).rejects.toEqual(code('INVITE_INVALID'));
  });
});

describe('AuthService.register', () => {
  it('passes through a duplicate on a constraint it does not know', async () => {
    const { AuthService } = await import('./auth/auth.service.js');
    const dup = Object.assign(new Error('duplicate'), { code: '23505', constraint: 'other' });
    const service = new AuthService(
      stub({ createUser: () => Promise.reject(dup) }),
      stub({}),
      clock,
    );
    await expect(
      service.register({ name: 'مدرس', phone: '01000000099', password: 'correct horse' }, '::1'),
    ).rejects.toBe(dup);
  });
});
