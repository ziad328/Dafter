import { beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import type { baseQuery as BaseQuery } from './base';

// A fake API whose refresh rotates the one valid access token, like the real one.
let valid = '';
let issued = 0;
let refreshes = 0;
let refreshFails = false;
const json = (status: number, body: unknown) =>
  new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } });

vi.stubGlobal('fetch', async (req: Request) => {
  const path = new URL(req.url).pathname;
  if (path === '/api/v1/auth/refresh') {
    refreshes++;
    await new Promise((r) => setTimeout(r, 10)); // keep it in flight while others arrive
    if (refreshFails) return json(401, { code: 'UNAUTHENTICATED' });
    valid = `t${++issued}`;
    return json(200, { accessToken: valid });
  }
  if (path === '/api/v1/auth/login') return json(401, { code: 'INVALID_CREDENTIALS' });
  const ok = req.headers.get('authorization') === `Bearer ${valid}`;
  return ok ? json(200, { ok }) : json(401, { code: 'UNAUTHENTICATED' });
});

let baseQuery: typeof BaseQuery;
const api = {
  signal: new AbortController().signal,
  abort: () => {},
  dispatch: () => {},
  getState: () => ({}),
  extra: undefined,
  endpoint: 'test',
  type: 'query',
} as Parameters<typeof BaseQuery>[1];
const call = (url: string) => baseQuery(url, api, {});

beforeAll(async () => {
  vi.stubEnv('VITE_API_URL', 'http://api.test');
  ({ baseQuery } = await import('./base'));
});
beforeEach(() => {
  refreshes = 0;
  refreshFails = false;
});

describe('baseQuery single-flight refresh', () => {
  it('after a reload, parallel requests share one refresh', async () => {
    const results = await Promise.all([call('/api/v1/me'), call('/api/v1/workspaces')]);
    expect(results.map((r) => r.error)).toEqual([undefined, undefined]);
    expect(refreshes).toBe(1);
  });

  it('parallel 401s on an expired token refresh once, then retry', async () => {
    await call('/api/v1/me');
    refreshes = 0;
    valid = 'expired-on-the-server';
    const results = await Promise.all([1, 2, 3].map(() => call('/api/v1/me')));
    expect(results.map((r) => r.error)).toEqual([undefined, undefined, undefined]);
    expect(refreshes).toBe(1);
  });

  it('a 401 from login is an answer, not a reason to refresh', async () => {
    const result = await baseQuery({ url: '/api/v1/auth/login', method: 'POST' }, api, {});
    expect(result.error).toMatchObject({ status: 401, data: { code: 'INVALID_CREDENTIALS' } });
    expect(refreshes).toBe(0);
  });

  it('answers 401 when the refresh fails, with or without a token', async () => {
    await call('/api/v1/me');
    valid = 'expired-on-the-server';
    refreshFails = true;
    expect((await call('/api/v1/me')).error).toMatchObject({ status: 401 });
    expect((await call('/api/v1/me')).error).toEqual({
      status: 401,
      data: { code: 'UNAUTHENTICATED' },
    });
  });

  it('starts without a workspace when storage is blocked', async () => {
    vi.resetModules();
    const spy = vi.spyOn(Storage.prototype, 'getItem').mockImplementation(() => {
      throw new Error('blocked');
    });
    const fresh = await import('./base');
    expect(fresh.getWorkspaceId()).toBeNull();
    spy.mockRestore();
  });
});
