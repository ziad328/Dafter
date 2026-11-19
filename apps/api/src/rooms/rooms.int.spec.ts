import type { NestFastifyApplication } from '@nestjs/platform-fastify';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { useTestDb } from '@dafter/db/testing';
import { createApp } from '../app.js';
import { FakeClock } from '../clock.js';
import { ConsoleMailer } from '../student-auth/mailer.js';
import { fixtures } from '../testing/fixtures.js';

const testDb = useTestDb();
// Saturday 15:00 Cairo.
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

type Center = Awaited<ReturnType<typeof f.center>>;
type Slot = { weekday: number; startTime: string; endTime: string };
const SAT = (startTime: string, endTime: string): Slot => ({ weekday: 6, startTime, endTime });

async function setup() {
  const c = await f.center();
  const subjectId = (await c.owner('GET', 'subjects')).json()[0].id as string;
  const gradeLevelId = (await c.owner('GET', 'grade-levels')).json()[0].id as string;
  const room = async (name: string) =>
    (await c.owner('POST', 'rooms', { name })).json().id as string;
  const group = (roomId: string | null, slots: Slot[], call: Center['owner'] = c.owner) =>
    // One teacher (the owner) in every room: force skips the teacher check, never the room's.
    call('POST', 'groups', { subjectId, gradeLevelId, roomId, slots, force: true });
  const sessionsOn = async (date: string) =>
    (await c.owner('GET', `sessions?from=${date}&to=${date}`)).json() as {
      id: string;
      groupId: string;
      startsAt: string;
      room: { id: string; name: string } | null;
    }[];
  return { c, room, group, sessionsOn };
}

describe('rooms', () => {
  it('the owner manages rooms; every staff role reads them', async () => {
    const { c } = await setup();
    const created = await c.owner('POST', 'rooms', { name: ' قاعة 1 ', capacity: 30 });
    expect(created.statusCode).toBe(201);
    const room = created.json();
    expect(room).toMatchObject({ name: 'قاعة 1', capacity: 30, status: 'active' });
    await c.owner('POST', 'rooms', { name: 'قاعة 2' });

    for (const call of [c.teacher, c.assistant]) {
      const list = (await call('GET', 'rooms')).json();
      expect(list.map((r: { name: string }) => r.name)).toEqual(['قاعة 1', 'قاعة 2']);
      const refused = await call('POST', 'rooms', { name: 'x' });
      expect([refused.statusCode, refused.json().code]).toEqual([403, 'FORBIDDEN']);
      const edit = await call('PATCH', `rooms/${room.id}`, { name: 'x' });
      expect(edit.json().code).toBe('FORBIDDEN');
    }

    const taken = await c.owner('POST', 'rooms', { name: 'قاعة 2' });
    expect([taken.statusCode, taken.json().code]).toEqual([409, 'ROOM_NAME_TAKEN']);
    const renameTaken = await c.owner('PATCH', `rooms/${room.id}`, { name: 'قاعة 2' });
    expect(renameTaken.json().code).toBe('ROOM_NAME_TAKEN');
    const bad = await c.owner('POST', 'rooms', { name: '' });
    expect(bad.json().code).toBe('VALIDATION_FAILED');

    const same = await c.owner('PATCH', `rooms/${room.id}`, {});
    expect(same.json()).toEqual(room);
    const archived = await c.owner('PATCH', `rooms/${room.id}`, {
      name: 'المعمل',
      capacity: null,
      status: 'archived',
    });
    expect(archived.json()).toMatchObject({ name: 'المعمل', capacity: null, status: 'archived' });
    // Active rooms first.
    const names = (await c.owner('GET', 'rooms')).json().map((r: { name: string }) => r.name);
    expect(names).toEqual(['قاعة 2', 'المعمل']);

    const missing = await c.owner('PATCH', `rooms/${crypto.randomUUID()}`, { name: 'y' });
    expect([missing.statusCode, missing.json().code]).toEqual([404, 'ROOM_NOT_FOUND']);

    // Another center sees none of them, and can't edit them.
    const other = await f.center();
    expect((await other.owner('GET', 'rooms')).json()).toEqual([]);
    const foreign = await other.owner('PATCH', `rooms/${room.id}`, { name: 'z' });
    expect(foreign.json().code).toBe('ROOM_NOT_FOUND');
  });
});

describe('groups in rooms', () => {
  it('puts the room on the group and its sessions, and refuses overlapping slots', async () => {
    const { c, room, group, sessionsOn } = await setup();
    const r1 = await room('قاعة 1');
    const r2 = await room('قاعة 2');

    const a = await group(r1, [SAT('16:00', '17:30')]);
    expect(a.statusCode).toBe(201);
    expect(a.json().room).toEqual({ id: r1, name: 'قاعة 1' });
    const today = (await sessionsOn('2026-11-21')).find((s) => s.groupId === a.json().id)!;
    expect(today.room).toEqual({ id: r1, name: 'قاعة 1' });

    // The teacher can't see group A, so the error names only the time.
    const clash = await group(r1, [SAT('17:00', '18:00')], c.teacher);
    expect([clash.statusCode, clash.json().code, clash.json().details]).toEqual([
      409,
      'ROOM_BOOKED',
      { weekday: 6, startTime: '16:00', endTime: '17:30' },
    ]);
    // Touching times, another weekday and another room are fine; so is no room.
    expect((await group(r1, [SAT('17:30', '19:00')])).statusCode).toBe(201);
    expect(
      (await group(r1, [{ weekday: 0, startTime: '16:00', endTime: '17:30' }])).statusCode,
    ).toBe(201);
    expect((await group(r2, [SAT('16:00', '17:30')])).statusCode).toBe(201);
    const none = await group(null, [SAT('16:00', '17:30')]);
    expect(none.json().room).toBeNull();
    expect((await sessionsOn('2026-11-21')).find((s) => s.groupId === none.json().id)!.room).toBe(
      null,
    );

    // An archived room, or another center's, can't be picked.
    await c.owner('PATCH', `rooms/${r2}`, { status: 'archived' });
    const archived = await group(r2, [SAT('08:00', '09:00')]);
    expect([archived.json().code, archived.json().details]).toEqual([
      'GROUP_REFERENCE_INVALID',
      { field: 'roomId' },
    ]);
    const other = await f.center();
    const theirs = (await other.owner('POST', 'rooms', { name: 'x' })).json().id;
    expect((await group(theirs, [SAT('08:00', '09:00')])).json().details).toEqual({
      field: 'roomId',
    });
  });

  it('checks the room on edit, and a new room moves the future sessions', async () => {
    const { c, room, group, sessionsOn } = await setup();
    const r1 = await room('قاعة 1');
    const r2 = await room('قاعة 2');
    await group(r1, [SAT('16:00', '17:30')]);
    const b = (await group(r2, [SAT('16:00', '17:30')])).json();

    // Into r1 at the same time: refused, nothing changes.
    const into = await c.owner('PATCH', `groups/${b.id}`, { roomId: r1 });
    expect(into.json().code).toBe('ROOM_BOOKED');
    // New slots that clash in its own room: refused.
    const c2 = (await group(r2, [SAT('18:00', '19:00')])).json();
    const slots = await c.owner('PATCH', `groups/${c2.id}`, {
      slots: [SAT('17:00', '18:30')],
      force: true,
    });
    expect(slots.json().code).toBe('ROOM_BOOKED');

    // Moving C to r1 at 18:00 is fine and takes its future sessions along.
    const moved = await c.owner('PATCH', `groups/${c2.id}`, { roomId: r1 });
    expect(moved.json().room.id).toBe(r1);
    const next = (await sessionsOn('2026-11-28')).find((s) => s.groupId === c2.id)!;
    expect(next.room!.id).toBe(r1);

    // An archived room stays on its group through other edits.
    await c.owner('PATCH', `rooms/${r2}`, { status: 'archived' });
    const kept = await c.owner('PATCH', `groups/${b.id}`, { roomId: r2, label: 'أ' });
    expect(kept.json()).toMatchObject({ label: 'أ', room: { id: r2 } });

    // Archive B, give its old slot to a new group in r2... then B can't come back.
    await c.owner('PATCH', `groups/${b.id}`, { status: 'archived' });
    await c.owner('PATCH', `rooms/${r2}`, { status: 'active' });
    await group(r2, [SAT('16:00', '17:00')]);
    const back = await c.owner('PATCH', `groups/${b.id}`, { status: 'active' });
    expect(back.json().code).toBe('ROOM_BOOKED');
    // Without a room it can.
    const freed = await c.owner('PATCH', `groups/${b.id}`, {
      roomId: null,
      status: 'active',
      force: true,
    });
    expect(freed.json()).toMatchObject({ room: null, status: 'active' });
  });

  it('refuses a move into a booked room, and a cancelled session frees it', async () => {
    const { c, room, group, sessionsOn } = await setup();
    const r1 = await room('قاعة 1');
    const a = (await group(r1, [SAT('16:00', '17:30')])).json();
    const b = (await group(r1, [SAT('18:00', '19:30')])).json();
    const day = await sessionsOn('2026-11-28');
    const sa = day.find((s) => s.groupId === a.id)!;
    const sb = day.find((s) => s.groupId === b.id)!;

    const move = { date: '2026-11-28', startTime: '17:00', endTime: '18:30' };
    const res = await c.owner('PATCH', `sessions/${sb.id}`, move);
    expect([res.statusCode, res.json().code]).toEqual([409, 'ROOM_BOOKED']);
    await c.owner('POST', `sessions/${sa.id}/cancel`);
    const ok = await c.owner('PATCH', `sessions/${sb.id}`, move);
    expect(ok.statusCode).toBe(200);
    expect(ok.json().room.id).toBe(r1);
  });

  it('moves one session to another room: no text to parents, booked and archived rooms refused', async () => {
    const { c, room, group, sessionsOn } = await setup();
    const [r1, r2, r3] = [await room('قاعة 1'), await room('قاعة 2'), await room('قاعة 3')];
    const a = (await group(r1, [SAT('16:00', '17:30')])).json();
    await group(r2, [SAT('16:30', '17:00')]);
    const student = (
      await c.owner('POST', 'students', {
        nameAr: 'طالب القاعة',
        gradeLevelId: a.gradeLevel.id,
        guardian: {
          phone: '01288800001',
          relation: 'mother',
          preferredLocale: 'ar',
          whatsappOptIn: true,
        },
      })
    ).json();
    await c.owner('POST', `students/${student.id}/enrollments`, { groupId: a.id });
    const sa = (await sessionsOn('2026-11-28')).find((s) => s.groupId === a.id)!;
    const same = { date: '2026-11-28', startTime: '16:00', endTime: '17:30' };
    const move = (roomId: string | null) =>
      c.owner('PATCH', `sessions/${sa.id}`, { ...same, roomId });

    const booked = await move(r2);
    expect([booked.statusCode, booked.json().code]).toEqual([409, 'ROOM_BOOKED']);
    await c.owner('PATCH', `rooms/${r3}`, { name: 'قاعة 3', status: 'archived' });
    for (const id of [r3, '00000000-0000-4000-8000-000000000000'])
      expect((await move(id)).json().code).toBe('ROOM_NOT_FOUND');

    await c.owner('PATCH', `rooms/${r3}`, { name: 'قاعة 3', status: 'active' });
    const moved = await move(r3);
    expect(moved.statusCode).toBe(200);
    expect(moved.json()).toMatchObject({ room: { id: r3 }, startsAt: sa.startsAt });
    // The group keeps its room for the other sessions.
    const next = (await sessionsOn('2026-12-05')).find((s) => s.groupId === a.id)!;
    expect(next.room!.id).toBe(r1);
    expect((await move(r3)).statusCode).toBe(200);
    expect((await move(null)).json().room).toBeNull();
    // Left out, the room stays; a room swap alone texts nobody.
    expect((await c.owner('PATCH', `sessions/${sa.id}`, same)).json().room).toBeNull();
    expect((await c.owner('GET', 'messages')).json()).toEqual([]);
  });

  it('generates a session without a room when a moved session already holds it', async () => {
    const { c, room, group, sessionsOn } = await setup();
    const r1 = await room('قاعة 1');
    const a = (await group(r1, [SAT('16:00', '17:30')])).json();
    // A's session of the 28th moves to Sunday the 29th, 16:00, in r1.
    const sa = (await sessionsOn('2026-11-28')).find((s) => s.groupId === a.id)!;
    await c.owner('PATCH', `sessions/${sa.id}`, {
      date: '2026-11-29',
      startTime: '16:00',
      endTime: '17:30',
    });
    // B meets on Sundays at 16:00 in r1: its slots don't clash with A's Saturdays.
    const b = await group(r1, [{ weekday: 0, startTime: '16:00', endTime: '17:30' }]);
    expect(b.statusCode).toBe(201);
    const clash = (await sessionsOn('2026-11-29')).find((s) => s.groupId === b.json().id)!;
    expect(clash.room).toBeNull();
    const later = (await sessionsOn('2026-12-06')).find((s) => s.groupId === b.json().id)!;
    expect(later.room!.id).toBe(r1);
  });

  it('two overlapping groups saved at the same moment: one wins', async () => {
    const { room, group, sessionsOn } = await setup();
    const r1 = await room('قاعة 1');
    const results = await Promise.all([
      group(r1, [SAT('16:00', '17:30')]),
      group(r1, [SAT('17:00', '18:00')]),
    ]);
    const outcomes = results.map((r) => [r.statusCode, r.json().code]).sort();
    const winner = results.find((r) => r.statusCode === 201)!.json();
    expect(winner.room.id).toBe(r1);
    const saturday = await sessionsOn('2026-11-28');
    expect(saturday.filter((s) => s.room?.id === r1).map((s) => s.groupId)).toEqual([winner.id]);
    expect(outcomes).toEqual([
      [201, undefined],
      [409, 'ROOM_BOOKED'],
    ]);
  });
});
