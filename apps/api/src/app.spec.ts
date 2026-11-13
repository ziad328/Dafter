import { afterAll, beforeAll, expect, it } from 'vitest';
import type { NestFastifyApplication } from '@nestjs/platform-fastify';
import { createApp } from './app.js';

let app: NestFastifyApplication;

beforeAll(async () => {
  app = await createApp({ logger: false });
  await app.init();
  await app.getHttpAdapter().getInstance().ready();
});

afterAll(() => app.close());

it('GET /health returns ok without the api prefix', async () => {
  const res = await app.inject({ method: 'GET', url: '/health' });
  expect(res.statusCode).toBe(200);
  expect(res.json()).toEqual({ status: 'ok' });
});

it('unknown api routes return 404', async () => {
  const res = await app.inject({ method: 'GET', url: '/api/v1/nope' });
  expect(res.statusCode).toBe(404);
});
