import type { NestFastifyApplication } from '@nestjs/platform-fastify';
import { eq } from 'drizzle-orm';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { auditLog } from '@dafter/db';
import { useTestDb } from '@dafter/db/testing';
import { createApp } from '../app.js';
import { FakeClock } from '../clock.js';
import { fixtures } from '../testing/fixtures.js';
import { ConsoleMailer } from './mailer.js';

const testDb = useTestDb();
const clock = new FakeClock(new Date('2026-11-23T08:00:00Z'));
const mailer = new ConsoleMailer();
let app: NestFastifyApplication;

beforeAll(async () => {
  app = await createApp({ logger: false, db: testDb().db, clock, mailer });
  await app.init();
  await app.getHttpAdapter().getInstance().ready();
});
afterAll(() => app.close());

const { bearer, post, register, center, codeFor, newKey, activate } = fixtures(
  () => app,
  () => testDb().db,
  mailer,
);

let c: Awaited<ReturnType<typeof center>>;
beforeAll(async () => {
  c = await center();
});

describe('enrollments', () => {
  it('enrolls into a visible group once, and keeps history on leave', async () => {
    const id = await c.newStudent();
    const url = `students/${id}/enrollments`;
    const res = await c.teacher('POST', url, { groupId: c.groupId, discountPct: 20 });
    expect(res.statusCode).toBe(201);
    expect(res.json()).toMatchObject({
      groupId: c.groupId,
      discountPct: 20,
      status: 'active',
      leftAt: null,
    });
    const again = await c.owner('POST', url, { groupId: c.groupId });
    expect([again.statusCode, again.json().code]).toEqual([409, 'ENROLLMENT_EXISTS']);

    const left = await c.owner('DELETE', `${url}/${res.json().id}`);
    expect(left.json()).toMatchObject({ status: 'left', leftAt: clock.now().toISOString() });
    const twice = await c.owner('DELETE', `${url}/${res.json().id}`);
    expect(twice.json().code).toBe('ENROLLMENT_NOT_FOUND');

    expect((await c.owner('POST', url, { groupId: c.groupId })).statusCode).toBe(201);
    const list = (await c.assistant('GET', url)).json() as { status: string }[];
    expect(list.map((e) => e.status)).toEqual(['active', 'left']);
  });

  it('hides groups outside the caller scope and rejects a bad discount', async () => {
    const url = `students/${await c.newStudent()}/enrollments`;
    const res = await c.assistant('POST', url, { groupId: c.groupId });
    expect([res.statusCode, res.json().code]).toEqual([404, 'GROUP_NOT_FOUND']);
    const bad = await c.owner('POST', url, { groupId: c.groupId, discountPct: 101 });
    expect(bad.json().code).toBe('VALIDATION_FAILED');
  });

  it("returns 404 for another workspace's student on every student-scoped route", async () => {
    const other = await center();
    const id = await c.newStudent();
    for (const [method, url] of [
      ['GET', `students/${id}/enrollments`],
      ['POST', `students/${id}/invite`],
      ['DELETE', `students/${id}/device`],
    ] as const) {
      const res = await other.owner(method, url);
      expect([url, res.statusCode, res.json().code]).toEqual([url, 404, 'STUDENT_NOT_FOUND']);
    }
    const enroll = await other.owner('POST', `students/${id}/enrollments`, {
      groupId: other.groupId,
    });
    expect(enroll.json().code).toBe('STUDENT_NOT_FOUND');
  });
});

describe('student activation and login', () => {
  it('activates with an invite and a code; the invite is single use', async () => {
    const id = await c.newStudent();
    const s = await activate(c.assistant, id, 'Sara@Example.com');
    const me = await app.inject({ method: 'GET', url: '/api/v1/me', headers: bearer(s.token) });
    expect(me.json()).toMatchObject({ email: 'sara@example.com', phone: null });
    expect((await c.owner('GET', `students/${id}`)).json()).toMatchObject({
      activated: true,
      deviceBound: false,
    });

    const reuse = await post('auth/otp/request', {
      email: 'other@example.com',
      inviteToken: s.inviteToken,
    });
    expect([reuse.statusCode, reuse.json().code]).toEqual([410, 'INVITE_INVALID']);
    const again = await c.owner('POST', `students/${id}/invite`);
    expect(again.json().code).toBe('STUDENT_ALREADY_ACTIVATED');
    // A student login is a member of no workspace, so staff routes show it nothing.
    const staff = await app.inject({
      method: 'GET',
      url: '/api/v1/workspaces',
      headers: bearer(s.token),
    });
    expect(staff.json()).toEqual([]);
  });

  it('a new invite replaces the older one', async () => {
    const id = await c.newStudent();
    const first = (await c.owner('POST', `students/${id}/invite`)).json().token;
    await c.owner('POST', `students/${id}/invite`);
    const res = await post('auth/otp/request', { email: 'old@example.com', inviteToken: first });
    expect(res.json().code).toBe('INVITE_INVALID');
  });

  it('logs in later with the email alone; unknown emails get the same 204 and no mail', async () => {
    const email = 'later@example.com';
    await activate(c.owner, await c.newStudent(), email);
    expect((await post('auth/otp/request', { email })).statusCode).toBe(204);
    expect((await post('auth/otp/verify', { email, code: codeFor(email) })).statusCode).toBe(200);

    const before = mailer.inbox.length;
    expect((await post('auth/otp/request', { email: 'nobody@example.com' })).statusCode).toBe(204);
    expect(mailer.inbox.length).toBe(before);
  });

  it('links the same login to a second center', async () => {
    const email = 'two-centers@example.com';
    const a = await activate(c.owner, await c.newStudent(), email);
    const other = await center();
    const b = await activate(other.owner, await other.newStudent(), email);
    expect(b.userId).toBe(a.userId);
  });

  it('never turns a staff account into a student login', async () => {
    await register('teacher@example.com');
    const id = await c.newStudent();
    const inviteToken = (await c.owner('POST', `students/${id}/invite`)).json().token;
    const res = await post('auth/otp/request', { email: 'teacher@example.com', inviteToken });
    expect(res.json().code).toBe('EMAIL_TAKEN');
    const before = mailer.inbox.length;
    expect((await post('auth/otp/request', { email: 'teacher@example.com' })).statusCode).toBe(204);
    expect(mailer.inbox.length).toBe(before);
  });

  it('burns a code after 5 wrong guesses, and a new request replaces the old code', async () => {
    const email = 'guess@example.com';
    await activate(c.owner, await c.newStudent(), email);
    await post('auth/otp/request', { email });
    const code = codeFor(email);
    const wrong = code === '000000' ? '111111' : '000000';
    for (let i = 0; i < 5; i++) {
      const res = await post('auth/otp/verify', { email, code: wrong });
      expect(res.json().code).toBe('OTP_INVALID');
    }
    expect((await post('auth/otp/verify', { email, code })).json().code).toBe('OTP_INVALID');

    await post('auth/otp/request', { email });
    const old = codeFor(email);
    await post('auth/otp/request', { email });
    // shortcut: two random 6-digit codes collide once in a million runs.
    expect(codeFor(email)).not.toBe(old);
    expect((await post('auth/otp/verify', { email, code: old })).json().code).toBe('OTP_INVALID');
    expect((await post('auth/otp/verify', { email, code: codeFor(email) })).statusCode).toBe(200);
  });
});

describe('phone binding', () => {
  const bind = (token: string, publicKey: string) =>
    post('devices/bind', { publicKey, label: 'Galaxy A14' }, bearer(token));

  it('binds one phone; an assistant reset revokes it and signs the student out', async () => {
    const id = await c.newStudent();
    const s = await activate(c.owner, id, 'bind@example.com');
    const key = await newKey();
    const first = await bind(s.token, key);
    expect(first.statusCode).toBe(201);
    // The phone calls bind on every visit; the same key is a no-op.
    expect((await bind(s.token, key)).json().id).toBe(first.json().id);
    expect((await c.owner('GET', `students/${id}`)).json().deviceBound).toBe(true);
    expect((await bind(s.token, await newKey())).json().code).toBe('DEVICE_ALREADY_BOUND');

    // One key cannot serve a second account.
    const other = await activate(c.owner, await c.newStudent(), 'bind2@example.com');
    expect((await bind(other.token, key)).json().code).toBe('DEVICE_ALREADY_BOUND');

    expect((await c.assistant('DELETE', `students/${id}/device`)).statusCode).toBe(204);
    expect((await c.owner('GET', `students/${id}`)).json().deviceBound).toBe(false);
    const refresh = await app.inject({
      method: 'POST',
      url: '/api/v1/auth/refresh',
      cookies: { rt: s.rt },
    });
    expect(refresh.statusCode).toBe(401);
    const audit = await testDb().db.select().from(auditLog).where(eq(auditLog.entityId, id));
    expect(audit.map((a) => a.action)).toContain('DELETE /api/v1/students/:id/device');

    // The access token lives out its 15 minutes, so the new phone can bind right away.
    expect((await bind(s.token, await newKey())).statusCode).toBe(201);
  });

  it('rejects staff accounts and keys that are not P-256', async () => {
    const staff = await register();
    expect((await bind(staff.token, await newKey())).json().code).toBe('FORBIDDEN');
    const s = await activate(c.owner, await c.newStudent(), 'badkey@example.com');
    expect((await bind(s.token, 'bm90LWEta2V5')).json().code).toBe('DEVICE_KEY_INVALID');
  });
});

// These advance the shared clock, so they run last.
describe('expiry', () => {
  it('rejects a code after 10 minutes', async () => {
    const id = await c.newStudent();
    const email = 'slow@example.com';
    const inviteToken = (await c.owner('POST', `students/${id}/invite`)).json().token;
    await post('auth/otp/request', { email, inviteToken });
    clock.advance(10 * 60 * 1000 + 1);
    const res = await post('auth/otp/verify', { email, code: codeFor(email), inviteToken });
    expect(res.json().code).toBe('OTP_INVALID');
  });

  it('rejects an invite after 72 hours', async () => {
    const id = await c.newStudent();
    const inviteToken = (await c.owner('POST', `students/${id}/invite`)).json().token;
    clock.advance(72 * 60 * 60 * 1000 + 1);
    const res = await post('auth/otp/request', { email: 'late@example.com', inviteToken });
    expect(res.json().code).toBe('INVITE_INVALID');
  });
});
