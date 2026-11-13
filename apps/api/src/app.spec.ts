import { afterAll, beforeAll, expect, it } from 'vitest';
import type { NestFastifyApplication } from '@nestjs/platform-fastify';
import type { Db } from '@dafter/db';
import { createApp } from './app.js';

let app: NestFastifyApplication;

beforeAll(async () => {
  app = await createApp({ logger: false, db: {} as Db }); // these routes never query;
  await app.init();
  await app.getHttpAdapter().getInstance().ready();
});

afterAll(() => app.close());

it('GET /health returns ok without the api prefix', async () => {
  const res = await app.inject({ method: 'GET', url: '/health' });
  expect(res.statusCode).toBe(200);
  expect(res.json()).toEqual({ status: 'ok' });
});

it('unknown api routes return 404 with an error code, not a sentence', async () => {
  const res = await app.inject({ method: 'GET', url: '/api/v1/nope' });
  expect(res.statusCode).toBe(404);
  expect(res.json()).toEqual({ code: 'NOT_FOUND' });
});
