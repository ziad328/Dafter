import type { NestFastifyApplication } from '@nestjs/platform-fastify';
import { hash } from '@node-rs/argon2';
import { eq } from 'drizzle-orm';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { refreshTokens } from '@dafter/db';
import { makeUser, useTestDb } from '@dafter/db/testing';
import { createApp } from '../app.js';
import { FakeClock } from '../clock.js';
import { REFRESH_COOKIE } from './auth.controller.js';
import { hashToken, REGISTER_PER_HOUR } from './auth.service.js';

const testDb = useTestDb();
const clock = new FakeClock();
let app: NestFastifyApplication;

beforeAll(async () => {
  app = await createApp({ logger: false, db: testDb().db, clock });
  await app.init();
  await app.getHttpAdapter().getInstance().ready();
});
afterAll(() => app.close());

let n = 0;
const uniquePhone = () => `0120000${String(++n).padStart(4, '0')}`;
const password = 'correct horse';

// Registrations default to loopback, which the per-IP register limit skips.
const post = (
  url: string,
  payload?: object,
  cookie?: string,
  ip = url === 'register' ? '127.0.0.1' : '10.0.0.1',
) =>
  app.inject({
    method: 'POST',
    url: `/api/v1/auth/${url}`,
    payload,
    remoteAddress: ip,
    headers: cookie ? { cookie: `${REFRESH_COOKIE}=${cookie}` } : {},
  });

const refreshCookie = (res: Awaited<ReturnType<typeof post>>) =>
  res.cookies.find((c) => c.name === REFRESH_COOKIE);

const getMe = (token?: string) =>
  app.inject({
    method: 'GET',
    url: '/api/v1/me',
    headers: token ? { authorization: `Bearer ${token}` } : {},
  });

async function registered() {
  const phone = uniquePhone();
  const res = await post('register', { name: 'منى حسن', phone, password });
  expect(res.statusCode).toBe(201);
  return { phone, accessToken: res.json().accessToken as string, rt: refreshCookie(res)!.value };
}

describe('register', () => {
  it('creates the user, returns an access token and sets an httpOnly refresh cookie', async () => {
    const phone = uniquePhone();
    const res = await post('register', {
      name: 'منى حسن',
      phone,
      email: 'Mona@Example.com',
      password,
    });
    expect(res.statusCode).toBe(201);
    expect(res.json().user).toMatchObject({ phone, email: 'mona@example.com', locale: 'ar' });
    const cookie = refreshCookie(res)!;
    expect(cookie).toMatchObject({ httpOnly: true, sameSite: 'Strict', path: '/api/v1/auth' });
    // Only the hash is stored.
    const [row] = await testDb()
      .db.select()
      .from(refreshTokens)
      .where(eq(refreshTokens.tokenHash, hashToken(cookie.value)));
    expect(row).toBeDefined();
  });

  it('rejects a taken phone or email (email case-insensitively)', async () => {
    const { phone } = await registered();
    const dupPhone = await post('register', { name: 'آخر', phone, password });
    expect(dupPhone.statusCode).toBe(409);
    expect(dupPhone.json()).toEqual({ code: 'PHONE_TAKEN' });

    const first = await post('register', { name: 'أحمد', email: 'dup@example.com', password });
    expect(first.statusCode).toBe(201);
    const dupEmail = await post('register', {
      name: 'آخر',
      email: 'DUP@example.com',
      password,
    });
    expect(dupEmail.json()).toEqual({ code: 'EMAIL_TAKEN' });
  });

  it('returns VALIDATION_FAILED with field paths for a bad body', async () => {
    const res = await post('register', { name: 'منى', phone: '123', password: 'short' });
    expect(res.statusCode).toBe(400);
    const body = res.json();
    expect(body.code).toBe('VALIDATION_FAILED');
    expect(body.details.issues.map((i: { path: string }) => i.path).sort()).toEqual([
      'password',
      'phone',
    ]);
  });
});

describe('login', () => {
  it('accepts phone or email with the right password', async () => {
    const user = await makeUser(testDb().db, {
      email: 'staff@example.com',
      passwordHash: await hash(password),
    });
    expect((await post('login', { login: user.phone, password })).statusCode).toBe(200);
    const byEmail = await post('login', { login: 'STAFF@example.com', password });
    expect(byEmail.statusCode).toBe(200);
    expect(refreshCookie(byEmail)).toBeDefined();
  });

  it('gives the same INVALID_CREDENTIALS for a wrong password, unknown user, or student', async () => {
    const { phone } = await registered();
    const student = await makeUser(testDb().db); // no password hash
    for (const body of [
      { login: phone, password: 'wrong password' },
      { login: '01999999999', password },
      { login: student.phone!, password },
    ]) {
      const res = await post('login', body, undefined, '10.0.0.2');
      expect(res.statusCode).toBe(401);
      expect(res.json()).toEqual({ code: 'INVALID_CREDENTIALS' });
    }
  });

  it('rate-limits after 5 failures per login, even with the right password, for 15 minutes', async () => {
    const { phone } = await registered();
    for (let i = 0; i < 5; i++)
      await post('login', { login: phone, password: 'nope' }, undefined, `10.1.0.${i}`);
    const blocked = await post('login', { login: phone, password }, undefined, '10.1.1.1');
    expect(blocked.statusCode).toBe(429);
    expect(blocked.json()).toEqual({ code: 'RATE_LIMITED' });
    clock.advance(15 * 60 * 1000);
    expect(
      (await post('login', { login: phone, password }, undefined, '10.1.1.1')).statusCode,
    ).toBe(200);
  });

  it('rate-limits per IP across different logins', async () => {
    const { phone } = await registered();
    for (let i = 0; i < 5; i++)
      await post('login', { login: uniquePhone(), password }, undefined, '10.2.0.1');
    expect(
      (await post('login', { login: phone, password }, undefined, '10.2.0.1')).statusCode,
    ).toBe(429);
  });
});

describe('register rate limit', () => {
  it('allows 10 sign-ups per IP an hour, then 429 until the hour ends', async () => {
    const signUp = () =>
      post('register', { name: 'سبام', phone: uniquePhone(), password }, undefined, '203.0.113.7');
    for (let i = 0; i < REGISTER_PER_HOUR; i++) expect((await signUp()).statusCode).toBe(201);
    const blocked = await signUp();
    expect([blocked.statusCode, blocked.json().code]).toEqual([429, 'RATE_LIMITED']);
    expect(
      (
        await post(
          'register',
          { name: 'آخر', phone: uniquePhone(), password },
          undefined,
          '203.0.113.8',
        )
      ).statusCode,
    ).toBe(201);
    clock.advance(60 * 60 * 1000);
    expect((await signUp()).statusCode).toBe(201);
  });
});

describe('access token and /me', () => {
  it('returns the user with a valid token and 401 without one', async () => {
    const { phone, accessToken } = await registered();
    const res = await getMe(accessToken);
    expect(res.statusCode).toBe(200);
    expect(res.json()).toMatchObject({ phone, name: 'منى حسن' });
    expect(res.json()).not.toHaveProperty('passwordHash');
    expect((await getMe()).json()).toEqual({ code: 'UNAUTHENTICATED' });
    expect((await getMe('garbage')).statusCode).toBe(401);
  });

  it('expires the access token after 15 minutes', async () => {
    const { accessToken } = await registered();
    clock.advance(14 * 60 * 1000);
    expect((await getMe(accessToken)).statusCode).toBe(200);
    clock.advance(60 * 1000);
    expect((await getMe(accessToken)).statusCode).toBe(401);
  });
});

describe('refresh rotation', () => {
  it('swaps the refresh token for a new one and issues a working access token', async () => {
    const { rt } = await registered();
    const res = await post('refresh', undefined, rt);
    expect(res.statusCode).toBe(200);
    const next = refreshCookie(res)!.value;
    expect(next).not.toBe(rt);
    expect((await getMe(res.json().accessToken)).statusCode).toBe(200);
    expect((await post('refresh', undefined, next)).statusCode).toBe(200);
  });

  it('revokes the whole family when an old token is reused', async () => {
    const { rt: first } = await registered();
    const second = refreshCookie(await post('refresh', undefined, first))!.value;

    // An attacker replays the first token: rejected, and the cookie is cleared.
    const replay = await post('refresh', undefined, first);
    expect(replay.statusCode).toBe(401);
    expect(refreshCookie(replay)!.value).toBe('');
    // The legitimate holder's newer token is now dead too.
    expect((await post('refresh', undefined, second)).statusCode).toBe(401);
  });

  it('does not touch other families of the same user', async () => {
    const { phone, rt: laptop } = await registered();
    const phoneRt = refreshCookie(await post('login', { login: phone, password }))!.value;
    await post('refresh', undefined, laptop);
    await post('refresh', undefined, laptop); // reuse on the laptop family
    expect((await post('refresh', undefined, phoneRt)).statusCode).toBe(200);
  });

  it('rejects a missing, unknown or expired refresh token', async () => {
    expect((await post('refresh')).statusCode).toBe(401);
    expect((await post('refresh', undefined, 'not-a-token')).statusCode).toBe(401);
    const { rt } = await registered();
    clock.advance(30 * 24 * 60 * 60 * 1000);
    expect((await post('refresh', undefined, rt)).statusCode).toBe(401);
  });

  it('lets only one of two concurrent refreshes with the same token succeed', async () => {
    const { rt } = await registered();
    const results = await Promise.all([
      post('refresh', undefined, rt),
      post('refresh', undefined, rt),
    ]);
    expect(results.map((r) => r.statusCode).sort()).toEqual([200, 401]);
  });
});

describe('logout', () => {
  it('revokes the family and clears the cookie', async () => {
    const { rt } = await registered();
    const res = await post('logout', undefined, rt);
    expect(res.statusCode).toBe(204);
    expect(refreshCookie(res)!.value).toBe('');
    expect((await post('refresh', undefined, rt)).statusCode).toBe(401);
  });

  it('succeeds without a cookie', async () => {
    expect((await post('logout')).statusCode).toBe(204);
  });
});
