import { request as httpRequest, createServer, type Server } from 'node:http';
import type { AddressInfo } from 'node:net';
import { guardians, outboxMessages } from '@dafter/db';
import { makeWorkspace, useTestDb } from '@dafter/db/testing';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { createApp } from './app.js';
import { FakeClock } from './clock.js';
import { StudentAuthRepository } from './student-auth/student-auth.repository.js';
import { GENERATE_SESSIONS } from './jobs/generate-sessions.js';
import { MONTHLY_CHARGES } from './jobs/monthly-charges.js';
import { SEND_OUTBOX } from './jobs/send-outbox.js';
import type { MessageProvider } from './messages/provider.js';
import handler from './vercel.js';
import { startWorker } from './worker.js';

/** The process entry points: main.ts, the Vercel handler and the pg-boss worker. */
const testDb = useTestDb();

afterEach(() => {
  vi.unstubAllEnvs();
  vi.resetModules();
});

const get = (port: number, path: string) =>
  new Promise<number>((resolve, reject) =>
    httpRequest({ port, path }, (res) => {
      res.resume();
      resolve(res.statusCode!);
    })
      .on('error', reject)
      .end(),
  );

describe('createApp', () => {
  it('needs DATABASE_URL when no database is passed in, and uses it when set', async () => {
    vi.stubEnv('DATABASE_URL', '');
    await expect(createApp({ logger: false })).rejects.toThrow('DATABASE_URL is not set');
    vi.stubEnv('DATABASE_URL', testDb().url);
    const app = await createApp({ logger: false });
    await app.close();
  });
});

describe('main.ts', () => {
  it('migrates, starts the worker, listens, and stops the worker on close', async () => {
    vi.stubEnv('DATABASE_URL', testDb().url);
    vi.stubEnv('DATABASE_URL_UNPOOLED', '');
    vi.stubEnv('MIGRATE_ON_START', '1');
    vi.stubEnv('RUN_WORKER', 'true');
    vi.stubEnv('PORT', '0');
    const { bootstrap } = await import('./main.js');
    const app = await bootstrap();
    const { port } = app.getHttpServer().address() as AddressInfo;
    expect(await get(port, '/health')).toBe(200);
    await app.close();
  }, 60_000);
});

describe('vercel.ts', () => {
  it('boots once, serves requests, and retries a failed boot on the next request', async () => {
    let server: Server | undefined;
    try {
      const failed = new Promise<unknown>((resolve) => {
        server = createServer((req, res) =>
          handler(req, res).catch((err: unknown) => {
            res.statusCode = 500;
            res.end();
            resolve(err);
          }),
        ).listen(0);
      });
      const { port } = server!.address() as AddressInfo;
      vi.stubEnv('DATABASE_URL', '');
      expect(await get(port, '/health')).toBe(500);
      expect(await failed).toBeInstanceOf(Error);
      vi.stubEnv('DATABASE_URL', testDb().url);
      expect(await get(port, '/health')).toBe(200);
      expect(await get(port, '/health')).toBe(200);
    } finally {
      server?.close();
    }
  }, 60_000);
});

describe('worker.ts', () => {
  it('registers the three jobs, and the outbox job sends a due message', async () => {
    const { db, url } = testDb();
    const ws = await makeWorkspace(db);
    const [guardian] = await db
      .insert(guardians)
      .values({ workspaceId: ws.id, phone: '01012345678' })
      .returning();
    await db.insert(outboxMessages).values({
      workspaceId: ws.id,
      guardianId: guardian!.id,
      trigger: 'absence',
      dedupeKey: 'worker-test',
      sendAfter: new Date(Date.now() - 60_000),
      payload: {
        startsAt: '2026-11-24T16:00:00Z',
        timezone: 'Africa/Cairo',
        centerAr: 'سنتر',
        centerEn: null,
        subjectAr: 'فيزياء',
        subjectEn: 'Physics',
        students: [{ nameAr: 'مريم', nameEn: null }],
      },
    });
    const sent: string[] = [];
    const boss = await startWorker(db, new FakeClock(new Date()), url, {
      send: async (to: string) => {
        sent.push(to);
        return 'provider-1';
      },
    } as MessageProvider);
    try {
      const queues = (await boss.getQueues()).map((q) => q.name);
      expect(queues).toEqual(
        expect.arrayContaining([GENERATE_SESSIONS, MONTHLY_CHARGES, SEND_OUTBOX]),
      );
      await boss.send(SEND_OUTBOX);
      await expect.poll(() => sent, { timeout: 20_000 }).toEqual(['01012345678']);
    } finally {
      await boss.stop({ graceful: false });
    }
  }, 60_000);
});

describe('StudentAuthRepository.findOrCreateStudentUser', () => {
  it('reads the row a parallel activation inserted first', async () => {
    const { db } = testDb();
    const repo = new StudentAuthRepository(db);
    const email = 'raced@example.com';
    let release!: () => void;
    const held = new Promise<void>((r) => (release = r));
    let inserted!: () => void;
    const first = new Promise<void>((r) => (inserted = r));
    // The first activation inserts and holds its transaction open...
    const a = db.transaction(async (tx) => {
      const u = await repo.findOrCreateStudentUser(tx as never, email, 'أ');
      inserted();
      await held;
      return u;
    });
    await first;
    // ...the second sees no row, then its insert waits on the first and finds the conflict.
    const b = db.transaction((tx) => repo.findOrCreateStudentUser(tx as never, email, 'ب'));
    await new Promise((r) => setTimeout(r, 300));
    release();
    const [ua, ub] = await Promise.all([a, b]);
    expect(ub.id).toBe(ua.id);
  });
});
