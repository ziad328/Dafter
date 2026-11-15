import type { NestFastifyApplication } from '@nestjs/platform-fastify';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { useTestDb } from '@dafter/db/testing';
import { createApp } from '../app.js';
import { FakeClock } from '../clock.js';
import { ConsoleMailer } from '../student-auth/mailer.js';
import { fixtures } from '../testing/fixtures.js';

const testDb = useTestDb();
const clock = new FakeClock(new Date('2026-11-21T13:00:00Z'));
const mailer = new ConsoleMailer();
let app: NestFastifyApplication;
const f = fixtures(
  () => app,
  () => testDb().db,
  mailer,
);

beforeAll(async () => {
  app = await createApp({ logger: false, db: testDb().db, clock, mailer });
  await app.init();
});
afterAll(() => app.close());

describe('attendance settings', () => {
  it('defaults to 15 minutes; everyone reads it, only the owner changes it', async () => {
    const c = await f.center();
    for (const call of [c.owner, c.teacher, c.assistant])
      expect((await call('GET', 'attendance-settings')).json()).toEqual({ lateAfterMinutes: 15 });

    for (const call of [c.teacher, c.assistant]) {
      const res = await call('PUT', 'attendance-settings', { lateAfterMinutes: 5 });
      expect([res.statusCode, res.json().code]).toEqual([403, 'FORBIDDEN']);
    }
    for (const bad of [-1, 121, 2.5])
      expect(
        (await c.owner('PUT', 'attendance-settings', { lateAfterMinutes: bad })).json().code,
      ).toBe('VALIDATION_FAILED');

    const saved = await c.owner('PUT', 'attendance-settings', { lateAfterMinutes: 0 });
    expect(saved.json()).toEqual({ lateAfterMinutes: 0 });
    expect((await c.teacher('GET', 'attendance-settings')).json()).toEqual({ lateAfterMinutes: 0 });
    // The message switches in the same settings column are kept.
    expect((await c.owner('GET', 'message-settings')).json()).toMatchObject({ absence: true });

    // Another center keeps its own.
    const other = await f.center();
    expect((await other.owner('GET', 'attendance-settings')).json()).toEqual({
      lateAfterMinutes: 15,
    });
  });
});
