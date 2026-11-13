import type { NestFastifyApplication } from '@nestjs/platform-fastify';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { useTestDb } from '@dafter/db/testing';
import { createApp } from '../app.js';

const testDb = useTestDb();
let app: NestFastifyApplication;

beforeAll(async () => {
  app = await createApp({ logger: false, db: testDb().db });
  await app.init();
  await app.getHttpAdapter().getInstance().ready();
});
afterAll(() => app.close());

let n = 0;
async function staff() {
  const phone = `0150000${String(++n).padStart(4, '0')}`;
  const res = await app.inject({
    method: 'POST',
    url: '/api/v1/auth/register',
    payload: { name: 'منى حسن', phone, password: 'correct horse' },
  });
  return res.json().accessToken as string;
}

const call = (method: 'GET' | 'POST', url: string, token: string, ws?: string, payload?: object) =>
  app.inject({
    method,
    url: `/api/v1/${url}`,
    payload,
    headers: { authorization: `Bearer ${token}`, ...(ws ? { 'x-workspace-id': ws } : {}) },
  });

const create = async (token: string, nameAr = 'سنتر النور') =>
  (await call('POST', 'workspaces', token, undefined, { type: 'center', nameAr })).json();

describe('POST /workspaces', () => {
  it('creates the workspace with the caller as owner', async () => {
    const token = await staff();
    const res = await call('POST', 'workspaces', token, undefined, {
      type: 'independent',
      nameAr: 'أ. أحمد',
      nameEn: 'Mr Ahmed',
    });
    expect(res.statusCode).toBe(201);
    expect(res.json()).toMatchObject({
      type: 'independent',
      nameAr: 'أ. أحمد',
      nameEn: 'Mr Ahmed',
      timezone: 'Africa/Cairo',
      role: 'owner',
    });
  });

  it('rejects an invalid body and an anonymous caller', async () => {
    const token = await staff();
    const bad = await call('POST', 'workspaces', token, undefined, { type: 'x', nameAr: '' });
    expect(bad.json().code).toBe('VALIDATION_FAILED');
    const anon = await app.inject({ method: 'POST', url: '/api/v1/workspaces', payload: {} });
    expect(anon.json().code).toBe('UNAUTHENTICATED');
  });
});

describe('GET /workspaces', () => {
  it("lists only the caller's workspaces, oldest first, with the caller's role", async () => {
    const me = await staff();
    const other = await staff();
    const first = await create(me, 'الأول');
    const second = await create(me, 'الثاني');
    await create(other, 'ليس لي');
    const res = await call('GET', 'workspaces', me);
    expect(res.statusCode).toBe(200);
    expect(res.json().map((w: { id: string }) => w.id)).toEqual([first.id, second.id]);
  });
});

describe('GET /workspaces/current (switch)', () => {
  it('returns the workspace named by X-Workspace-Id', async () => {
    const token = await staff();
    const a = await create(token, 'سنتر أ');
    const b = await create(token, 'سنتر ب');
    expect((await call('GET', 'workspaces/current', token, a.id)).json()).toEqual(a);
    expect((await call('GET', 'workspaces/current', token, b.id)).json()).toEqual(b);
  });

  it('needs the header, and treats a malformed or unknown id as not found', async () => {
    const token = await staff();
    expect((await call('GET', 'workspaces/current', token)).json().code).toBe('VALIDATION_FAILED');
    for (const ws of ['not-a-uuid', crypto.randomUUID()]) {
      const res = await call('GET', 'workspaces/current', token, ws);
      expect(res.statusCode).toBe(404);
      expect(res.json().code).toBe('WORKSPACE_NOT_FOUND');
    }
  });
});
