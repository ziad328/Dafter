import { RequestMethod } from '@nestjs/common';
import { GUARDS_METADATA, METHOD_METADATA, PATH_METADATA } from '@nestjs/common/constants';
import { ModulesContainer } from '@nestjs/core';
import type { NestFastifyApplication } from '@nestjs/platform-fastify';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { useTestDb } from '@dafter/db/testing';
import { createApp } from './app.js';
import { TenantGuard } from './workspaces/tenant.guard.js';

/**
 * Generated isolation suite: every route is read from Nest's metadata, so a new endpoint is
 * covered without registering it here. A route must either use TenantGuard or be listed below.
 */
const NON_TENANT_ROUTES = new Set([
  'GET /health',
  'POST /api/v1/auth/register',
  'POST /api/v1/auth/login',
  'POST /api/v1/auth/refresh',
  'POST /api/v1/auth/logout',
  'GET /api/v1/me',
  // Cross-workspace by design: create a workspace, list my workspaces.
  'POST /api/v1/workspaces',
  'GET /api/v1/workspaces',
]);

const testDb = useTestDb();
let app: NestFastifyApplication;

interface Route {
  method: string;
  path: string;
  tenant: boolean;
}

function discoverRoutes(): Route[] {
  const routes: Route[] = [];
  for (const mod of app.get(ModulesContainer).values()) {
    for (const { metatype } of mod.controllers.values()) {
      if (!metatype) continue;
      const base = Reflect.getMetadata(PATH_METADATA, metatype) as string;
      const classGuards = Reflect.getMetadata(GUARDS_METADATA, metatype) ?? [];
      const proto = metatype.prototype as Record<string, unknown>;
      for (const name of Object.getOwnPropertyNames(proto)) {
        const handler = proto[name];
        if (typeof handler !== 'function' || name === 'constructor') continue;
        const sub = Reflect.getMetadata(PATH_METADATA, handler) as string | undefined;
        if (sub === undefined) continue;
        const guards = [...classGuards, ...(Reflect.getMetadata(GUARDS_METADATA, handler) ?? [])];
        const parts = [base, sub].filter((p) => p && p !== '/');
        const prefix = base === 'health' ? '' : '/api/v1';
        routes.push({
          method: RequestMethod[Reflect.getMetadata(METHOD_METADATA, handler) as number]!,
          path: `${prefix}/${parts.join('/')}`,
          tenant: guards.includes(TenantGuard),
        });
      }
    }
  }
  return routes;
}

let tokenB: string;
let wsA: string;

beforeAll(async () => {
  app = await createApp({ logger: false, db: testDb().db });
  await app.init();
  await app.getHttpAdapter().getInstance().ready();

  const register = async (phone: string) =>
    (
      await app.inject({
        method: 'POST',
        url: '/api/v1/auth/register',
        payload: { name: 'مستخدم', phone, password: 'correct horse' },
      })
    ).json().accessToken as string;
  const createWs = async (token: string) =>
    (
      await app.inject({
        method: 'POST',
        url: '/api/v1/workspaces',
        headers: { authorization: `Bearer ${token}` },
        payload: { type: 'center', nameAr: 'سنتر' },
      })
    ).json().id as string;

  wsA = await createWs(await register('01600000001'));
  tokenB = await register('01600000002');
  await createWs(tokenB);
});
afterAll(() => app.close());

describe('tenant isolation', () => {
  it('every route is tenant-guarded or explicitly non-tenant', () => {
    const routes = discoverRoutes();
    expect(routes.length).toBeGreaterThan(NON_TENANT_ROUTES.size);
    const unguarded = routes
      .filter((r) => !r.tenant)
      .map((r) => `${r.method} ${r.path}`)
      .filter((key) => !NON_TENANT_ROUTES.has(key));
    expect(unguarded).toEqual([]);
  });

  it("every tenant route returns 404 to a member of B sending A's workspace id", async () => {
    const tenantRoutes = discoverRoutes().filter((r) => r.tenant);
    expect(tenantRoutes.length).toBeGreaterThan(0);
    for (const r of tenantRoutes) {
      const res = await app.inject({
        method: r.method as 'GET',
        // Any path param works: TenantGuard rejects before the handler looks at it.
        url: r.path.replace(/:\w+/g, crypto.randomUUID()),
        headers: { authorization: `Bearer ${tokenB}`, 'x-workspace-id': wsA },
        payload: r.method === 'GET' ? undefined : {},
      });
      expect([r.path, res.statusCode, res.json().code]).toEqual([
        r.path,
        404,
        'WORKSPACE_NOT_FOUND',
      ]);
    }
  });
});
