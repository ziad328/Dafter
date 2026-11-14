import type { NestFastifyApplication } from '@nestjs/platform-fastify';
import { eq } from 'drizzle-orm';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { sessions } from '@dafter/db';
import { useTestDb } from '@dafter/db/testing';
import { createApp } from '../app.js';
import { FakeClock } from '../clock.js';
import { ConsoleMailer } from '../student-auth/mailer.js';
import { type Call, fixtures } from '../testing/fixtures.js';
import { qrCode, sessionKey, windowAt } from './qr.js';

const testDb = useTestDb();
// Saturday 15:00 Cairo; the fixture group's session starts at 16:00 Cairo (14:00 UTC).
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
  await app.getHttpAdapter().getInstance().ready();
});
afterAll(() => app.close());

let c: Awaited<ReturnType<typeof f.center>>;
let sessionId: string;
let n = 0;

const todaysSession = async (call: Call) =>
  (await call('GET', 'sessions?from=2026-11-21&to=2026-11-21')).json()[0].id as string;

/** An activated student with a bound phone, enrolled in the fixture group unless told not to. */
async function phone(opts: { enroll?: boolean; center?: typeof c } = {}) {
  const at = opts.center ?? c;
  const id = await at.newStudent();
  if (opts.enroll !== false)
    await at.owner('POST', `students/${id}/enrollments`, { groupId: at.groupId });
  const s = await f.activate(at.owner, id, `p${++n}@example.com`);
  const { pair, publicKey } = await f.newKeyPair();
  await f.post('devices/bind', { publicKey }, f.bearer(s.token));
  const scan = async (code: string, key = pair.privateKey) => {
    const sig = await crypto.subtle.sign(
      { name: 'ECDSA', hash: 'SHA-256' },
      key,
      new TextEncoder().encode(code),
    );
    return f.post(
      'check-ins',
      { code, signature: Buffer.from(sig).toString('base64url') },
      f.bearer(s.token),
    );
  };
  return { id, token: s.token, pair, scan };
}

const key = (id: string) => sessionKey(process.env.QR_SECRET!, id);
const codeAt = (id: string, offset = 0) =>
  qrCode(key(id), id, windowAt(clock.now().getTime()) + offset);

beforeAll(async () => {
  c = await f.center();
  sessionId = await todaysSession(c.owner);
});

describe('opening a session', () => {
  it('refuses scans before it opens, then gives the teacher the key and server time', async () => {
    const p = await phone();
    const early = await p.scan(codeAt(sessionId));
    expect([early.statusCode, early.json().code]).toEqual([409, 'SESSION_NOT_OPEN']);

    const res = await c.teacher('POST', `sessions/${sessionId}/open`);
    expect(res.statusCode).toBe(200);
    expect(res.json()).toEqual({
      sessionId,
      qrKey: key(sessionId).toString('base64url'),
      serverTime: clock.now().toISOString(),
      windowMs: 10_000,
    });
    // Reopening returns the same key, so a refreshed teacher screen keeps working.
    expect((await c.owner('POST', `sessions/${sessionId}/open`)).json().qrKey).toBe(
      res.json().qrKey,
    );
  });

  it("is a 404 for another center's staff and for an unscoped assistant", async () => {
    const other = await f.center();
    const res = await other.owner('POST', `sessions/${sessionId}/open`);
    expect([res.statusCode, res.json().code]).toEqual([404, 'SESSION_NOT_FOUND']);
    const list = await other.owner('GET', `sessions/${sessionId}/attendance`);
    expect(list.json().code).toBe('SESSION_NOT_FOUND');
    expect((await c.assistant('POST', `sessions/${sessionId}/open`)).json().code).toBe(
      'SESSION_NOT_FOUND',
    );
  });
});

describe('check-ins', () => {
  beforeAll(async () => {
    await c.owner('POST', `sessions/${sessionId}/open`);
  });

  it('records an enrolled student as present; a repeat returns the first record', async () => {
    const p = await phone();
    const first = await p.scan(codeAt(sessionId));
    expect(first.statusCode).toBe(200);
    expect(first.json()).toMatchObject({
      sessionId,
      status: 'present',
      recordedAt: clock.now().toISOString(),
    });
    const again = await p.scan(codeAt(sessionId, -1));
    expect(again.json()).toEqual(first.json());
    const list = (await c.teacher('GET', `sessions/${sessionId}/attendance`)).json();
    expect(list.filter((r: { studentId: string }) => r.studentId === p.id)).toMatchObject([
      { status: 'present', method: 'student_scan' },
    ]);
  });

  it('accepts the previous window, rejects older, future, forged and foreign codes', async () => {
    const p = await phone();
    const code = (await p.scan(codeAt(sessionId, -2))).json().code;
    expect(code).toBe('CHECKIN_CODE_EXPIRED');
    expect((await p.scan(codeAt(sessionId, 1))).json().code).toBe('CHECKIN_CODE_INVALID');
    const forged =
      codeAt(sessionId).slice(0, -2) + (codeAt(sessionId).endsWith('AA') ? 'BB' : 'AA');
    expect((await p.scan(forged)).json().code).toBe('CHECKIN_CODE_INVALID');
    expect((await p.scan('not-a-dafter-code')).json().code).toBe('CHECKIN_CODE_INVALID');
    // A code made with another secret for the same session id.
    const fake = qrCode(sessionKey('guess', sessionId), sessionId, windowAt(clock.now().getTime()));
    expect((await p.scan(fake)).json().code).toBe('CHECKIN_CODE_INVALID');
    expect((await p.scan(codeAt(sessionId, -1))).json().status).toBe('present');
  });

  it('needs the bound phone: another key or no binding is refused', async () => {
    const p = await phone();
    const other = await f.newKeyPair();
    const res = await p.scan(codeAt(sessionId), other.pair.privateKey);
    expect([res.statusCode, res.json().code]).toEqual([403, 'DEVICE_SIGNATURE_INVALID']);

    const id = await c.newStudent();
    const s = await f.activate(c.owner, id, `nobind${++n}@example.com`);
    const unbound = await f.post(
      'check-ins',
      { code: codeAt(sessionId), signature: 'AAAA' },
      f.bearer(s.token),
    );
    expect(unbound.json().code).toBe('DEVICE_NOT_BOUND');
  });

  it('counts a student of the center who is not in the group as a make-up', async () => {
    const p = await phone({ enroll: false });
    expect((await p.scan(codeAt(sessionId))).json().status).toBe('makeup');
  });

  it("refuses a student of another center (their record is not in this session's workspace)", async () => {
    const other = await f.center();
    const p = await phone({ center: other });
    const res = await p.scan(codeAt(sessionId));
    expect([res.statusCode, res.json().code]).toEqual([404, 'SESSION_NOT_FOUND']);
  });
});

describe('roster', () => {
  it('lists active enrolled students only, and hides foreign sessions', async () => {
    const enrolled = await c.newStudent();
    await c.owner('POST', `students/${enrolled}/enrollments`, { groupId: c.groupId });
    const archived = await c.newStudent();
    await c.owner('POST', `students/${archived}/enrollments`, { groupId: c.groupId });
    await c.owner('PATCH', `students/${archived}`, { status: 'archived' });
    const outsider = await c.newStudent();

    const ids = (await c.teacher('GET', `sessions/${sessionId}/roster`))
      .json()
      .map((r: { studentId: string }) => r.studentId);
    expect(ids).toContain(enrolled);
    expect(ids).not.toContain(archived);
    expect(ids).not.toContain(outsider);

    const other = await f.center();
    const res = await other.owner('GET', `sessions/${sessionId}/roster`);
    expect([res.statusCode, res.json().code]).toEqual([404, 'SESSION_NOT_FOUND']);
  });
});

describe('manual marking', () => {
  it('overrides a scan, records who marked, and works after close but not before open', async () => {
    const p = await phone();
    await p.scan(codeAt(sessionId));
    const res = await c.owner('PUT', `sessions/${sessionId}/attendance/${p.id}`, {
      status: 'excused',
    });
    expect(res.statusCode).toBe(200);
    expect(res.json()).toMatchObject({ studentId: p.id, status: 'excused', method: 'manual' });
    // A scan after the manual mark leaves the mark alone.
    expect((await p.scan(codeAt(sessionId))).json().status).toBe('excused');

    const unknown = await c.teacher(
      'PUT',
      `sessions/${sessionId}/attendance/${crypto.randomUUID()}`,
      {
        status: 'absent',
      },
    );
    expect(unknown.json().code).toBe('STUDENT_NOT_FOUND');

    const next = (await c.owner('GET', 'sessions?from=2026-11-28&to=2026-11-28')).json()[0].id;
    const early = await c.owner('PUT', `sessions/${next}/attendance/${p.id}`, { status: 'absent' });
    expect(early.json().code).toBe('SESSION_NOT_OPEN');

    await testDb().db.update(sessions).set({ status: 'closed' }).where(eq(sessions.id, sessionId));
    const after = await c.teacher('PUT', `sessions/${sessionId}/attendance/${p.id}`, {
      status: 'present',
    });
    expect(after.json().status).toBe('present');
    const closedScan = await (await phone()).scan(codeAt(sessionId));
    expect(closedScan.json().code).toBe('SESSION_NOT_OPEN');
    await testDb().db.update(sessions).set({ status: 'open' }).where(eq(sessions.id, sessionId));
  });
});

const sessionOn = async (date: string) =>
  (await c.owner('GET', `sessions?from=${date}&to=${date}`)).json()[0].id as string;

describe('closing a session', () => {
  it('marks every active enrolled student without a record absent, once', async () => {
    const id = await sessionOn('2026-11-28');
    await c.teacher('POST', `sessions/${id}/open`);
    const scanned = await phone();
    const missing = await phone();
    const makeup = await phone({ enroll: false });
    const archived = await phone();
    await c.owner('PATCH', `students/${archived.id}`, { status: 'archived' });
    await scanned.scan(codeAt(id));

    const res = await c.teacher('POST', `sessions/${id}/close`);
    expect(res.statusCode).toBe(200);
    const byStudent = new Map<string, { status: string; method: string }>(
      res
        .json()
        .map((r: { studentId: string; status: string; method: string }) => [r.studentId, r]),
    );
    expect(byStudent.get(scanned.id)).toMatchObject({ status: 'present', method: 'student_scan' });
    expect(byStudent.get(missing.id)).toMatchObject({ status: 'absent', method: 'auto_close' });
    expect(byStudent.has(makeup.id)).toBe(false);
    expect(byStudent.has(archived.id)).toBe(false);

    expect((await c.owner('POST', `sessions/${id}/close`)).json().code).toBe('SESSION_NOT_OPEN');
    expect((await makeup.scan(codeAt(id))).json().code).toBe('SESSION_NOT_OPEN');
    expect((await c.assistant('POST', `sessions/${id}/close`)).json().code).toBe(
      'SESSION_NOT_FOUND',
    );
  });
});

describe('live stream', () => {
  it('sends the records so far, then each new check-in', async () => {
    const id = await sessionOn('2026-12-05');
    await c.owner('POST', `sessions/${id}/open`);
    const early = await phone();
    await early.scan(codeAt(id));
    const late = await phone();

    await app.listen(0, '127.0.0.1');
    const address = (await app.getUrl()).replace('[::1]', '127.0.0.1');
    const ctrl = new AbortController();
    const res = await fetch(`${address}/api/v1/sessions/${id}/live`, {
      headers: c.ownerHeaders,
      signal: ctrl.signal,
    });
    expect(res.headers.get('content-type')).toContain('text/event-stream');
    const reader = res.body!.pipeThrough(new TextDecoderStream()).getReader();
    const seen: string[] = [];
    const until = async (studentId: string) => {
      while (!seen.includes(studentId)) {
        const { value } = await reader.read();
        for (const line of value!.split('\n'))
          if (line.startsWith('data: ')) seen.push(JSON.parse(line.slice(6)).studentId);
      }
    };
    await until(early.id);
    await late.scan(codeAt(id));
    await until(late.id);
    ctrl.abort();

    const other = await f.center();
    const denied = await fetch(`${address}/api/v1/sessions/${id}/live`, {
      headers: other.ownerHeaders,
    });
    expect(denied.status).toBe(404);
    expect(((await denied.json()) as { code: string }).code).toBe('SESSION_NOT_FOUND');
  });
});

// Moves the session's start back in the database rather than advancing the clock, which would
// expire every access token in the suite.
describe('late threshold', () => {
  it('marks a scan more than 15 minutes after the start as late', async () => {
    const startsAt = new Date(clock.now().getTime() - 16 * 60_000);
    await testDb()
      .db.update(sessions)
      .set({ startsAt, endsAt: new Date(startsAt.getTime() + 90 * 60_000) })
      .where(eq(sessions.id, sessionId));
    const p = await phone();
    expect((await p.scan(codeAt(sessionId))).json().status).toBe('late');
  });
});
