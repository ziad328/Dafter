import type { NestFastifyApplication } from '@nestjs/platform-fastify';
import { eq } from 'drizzle-orm';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { ledgerEntries, outboxMessages, studentGuardians } from '@dafter/db';
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

const ids = (rows: { id: string }[]) => rows.map((r) => r.id);

describe('cursor pagination', () => {
  it('pages the student list (and who owes) without gaps or repeats', async () => {
    const c = await f.center();
    const made: string[] = [];
    for (let i = 0; i < 53; i++) made.push(await c.newStudent());
    const archived = made[0]!;
    await c.owner('PATCH', `students/${archived}`, { status: 'archived' });
    const list = async (q: string) => (await c.owner('GET', `students?${q}`)).json();

    const first = await list('');
    expect(first).toHaveLength(50);
    const second = await list(`after=${first.at(-1).id}`);
    expect(second).toHaveLength(3);
    const all = [...ids(first), ...ids(second)];
    expect(new Set(all).size).toBe(53);
    // Active first, then newest first; the archived student is last.
    expect(all.at(-1)).toBe(archived);
    expect(all[0]).toBe(made.at(-1));
    expect(await list(`after=${archived}`)).toEqual([]);

    // Who owes: biggest balance first, ties newest first, across a page break.
    const owe = made.slice(1, 4);
    for (const [i, id] of owe.entries())
      await testDb()
        .db.insert(ledgerEntries)
        .values({
          workspaceId: c.workspaceId,
          studentId: id,
          groupId: c.groupId,
          type: 'charge',
          amountPiastres: i === 2 ? 5000 : 1000,
        });
    const top = await list('owes=true');
    expect(ids(top)).toEqual([owe[2], owe[1], owe[0]]);
    expect(ids(await list(`owes=true&after=${owe[2]}`))).toEqual([owe[1], owe[0]]);
    expect(ids(await list(`owes=true&after=${owe[1]}`))).toEqual([owe[0]]);

    // A search is not paged; a cursor from another center is not found.
    const searched = await c.owner('GET', `students?q=x&after=${made[1]}`);
    expect(searched.statusCode).toBe(400);
    const other = await f.center();
    const foreign = await other.newStudent();
    expect((await c.owner('GET', `students?after=${foreign}`)).json().code).toBe(
      'STUDENT_NOT_FOUND',
    );
  });

  it('pages the message log newest first, ties broken by id', async () => {
    const c = await f.center();
    const db = testDb().db;
    const studentId = await c.newStudent();
    const [link] = await db
      .select({ guardianId: studentGuardians.guardianId })
      .from(studentGuardians)
      .where(eq(studentGuardians.studentId, studentId));
    const at = new Date('2026-11-20T10:00:00Z');
    await db.insert(outboxMessages).values(
      Array.from({ length: 105 }, (_, i) => ({
        workspaceId: c.workspaceId,
        guardianId: link!.guardianId,
        trigger: 'absence' as const,
        payload: { students: [] },
        dedupeKey: `absence:test:${i}`,
        sendAfter: at,
        // Half share one timestamp: the id decides.
        createdAt: i % 2 ? at : new Date(at.getTime() + i * 1000),
      })),
    );
    const log = async (q = '') => (await c.owner('GET', `messages${q}`)).json();
    const first = await log();
    expect(first).toHaveLength(100);
    const second = await log(`?after=${first.at(-1).id}`);
    expect(second).toHaveLength(5);
    expect(new Set([...ids(first), ...ids(second)]).size).toBe(105);
    const times = [...first, ...second].map((m) => Date.parse(m.createdAt));
    expect(times).toEqual([...times].sort((a, b) => b - a));
    // Filtered by status, the cursor still applies; an unknown id gives an empty page.
    expect(await log(`?status=queued&after=${first.at(-1).id}`)).toHaveLength(5);
    expect(await log(`?after=${crypto.randomUUID()}`)).toEqual([]);
  });
});
