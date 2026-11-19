import type { NestFastifyApplication } from '@nestjs/platform-fastify';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { GRADE_LEVELS, SUBJECTS } from '@dafter/db';
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

type Entry = { id: string; nameAr: string; nameEn: string; status: string };
const SAT = { weekday: 6, startTime: '18:00', endTime: '19:00' };

describe.each([
  ['subjects', SUBJECTS],
  ['grade-levels', GRADE_LEVELS],
] as const)('curriculum: %s', (path, seeded) => {
  it('the owner adds, renames, archives and restores; every staff role reads', async () => {
    const c = await f.center();
    const start = (await c.owner('GET', path)).json() as Entry[];
    expect(start.map((e) => e.nameAr)).toEqual(seeded.map(([ar]) => ar));
    expect(start.every((e) => e.status === 'active')).toBe(true);

    const created = await c.owner('POST', path, { nameAr: ' البرمجة ' });
    expect(created.statusCode).toBe(201);
    const item = created.json() as Entry;
    // The English name defaults to the Arabic one.
    expect(item).toMatchObject({ nameAr: 'البرمجة', nameEn: 'البرمجة', status: 'active' });
    const second = (
      await c.owner('POST', path, { nameAr: 'الروبوتات', nameEn: 'Robotics' })
    ).json();

    for (const call of [c.teacher, c.assistant]) {
      const list = (await call('GET', path)).json() as Entry[];
      // New items go to the end, in the order they were added.
      expect(list.slice(-2).map((e) => e.id)).toEqual([item.id, second.id]);
      const add = await call('POST', path, { nameAr: 'x' });
      expect([add.statusCode, add.json().code]).toEqual([403, 'FORBIDDEN']);
      const edit = await call('PATCH', `${path}/${item.id}`, { nameAr: 'x' });
      expect([edit.statusCode, edit.json().code]).toEqual([403, 'FORBIDDEN']);
    }

    const taken = await c.owner('POST', path, { nameAr: seeded[0]![0] });
    expect([taken.statusCode, taken.json().code]).toEqual([409, 'CURRICULUM_NAME_TAKEN']);
    const renameTaken = await c.owner('PATCH', `${path}/${item.id}`, { nameAr: 'الروبوتات' });
    expect(renameTaken.json().code).toBe('CURRICULUM_NAME_TAKEN');
    const blank = await c.owner('POST', path, { nameAr: '  ' });
    expect(blank.json().code).toBe('VALIDATION_FAILED');

    expect((await c.owner('PATCH', `${path}/${item.id}`, {})).json()).toEqual(item);
    const renamed = await c.owner('PATCH', `${path}/${item.id}`, {
      nameAr: 'برمجة الحاسب',
      nameEn: 'Programming',
      status: 'archived',
    });
    expect(renamed.json()).toEqual({
      id: item.id,
      nameAr: 'برمجة الحاسب',
      nameEn: 'Programming',
      status: 'archived',
    });
    const restored = await c.owner('PATCH', `${path}/${item.id}`, { status: 'active' });
    expect(restored.json().status).toBe('active');

    const missing = await c.owner('PATCH', `${path}/${crypto.randomUUID()}`, { nameAr: 'x' });
    expect([missing.statusCode, missing.json().code]).toEqual([404, 'CURRICULUM_ITEM_NOT_FOUND']);
  });

  it("another center's item is a 404 and never in the list", async () => {
    const a = await f.center();
    const b = await f.center();
    const item = (await a.owner('POST', path, { nameAr: 'مادة سنتر أ' })).json() as Entry;
    const edit = await b.owner('PATCH', `${path}/${item.id}`, { nameAr: 'x' });
    expect([edit.statusCode, edit.json().code]).toEqual([404, 'CURRICULUM_ITEM_NOT_FOUND']);
    const list = (await b.owner('GET', path)).json() as Entry[];
    expect(list.some((e) => e.id === item.id)).toBe(false);
    // The same name is fine in another center.
    expect((await b.owner('POST', path, { nameAr: 'مادة سنتر أ' })).statusCode).toBe(201);
  });
});

describe('archived curriculum on groups and students', () => {
  it('is refused when newly picked, and stays where it is already used', async () => {
    const c = await f.center();
    const subjects = (await c.owner('GET', 'subjects')).json() as Entry[];
    const grades = (await c.owner('GET', 'grade-levels')).json() as Entry[];
    const [subject, otherSubject] = [subjects[0]!.id, subjects[1]!.id];
    const [grade, otherGrade] = [grades[0]!.id, grades[1]!.id];

    const group = (
      await c.owner('POST', 'groups', {
        subjectId: subject,
        gradeLevelId: grade,
        slots: [SAT],
        force: true,
      })
    ).json();
    const studentId = await c.newStudent();

    for (const [path, id] of [
      ['subjects', subject],
      ['grade-levels', grade],
    ] as const)
      expect((await c.owner('PATCH', `${path}/${id}`, { status: 'archived' })).statusCode).toBe(
        200,
      );

    // A new group can't pick an archived subject or grade.
    const newGroup = (body: object) =>
      c.owner('POST', 'groups', {
        subjectId: otherSubject,
        gradeLevelId: otherGrade,
        slots: [SAT],
        force: true,
        ...body,
      });
    const badSubject = await newGroup({ subjectId: subject });
    expect([badSubject.statusCode, badSubject.json()]).toEqual([
      400,
      { code: 'GROUP_REFERENCE_INVALID', details: { field: 'subjectId' } },
    ]);
    const badGrade = await newGroup({ gradeLevelId: grade });
    expect(badGrade.json().details).toEqual({ field: 'gradeLevelId' });

    // The existing group keeps them when saved as it is, and can move to active ones.
    const kept = await c.owner('PATCH', `groups/${group.id}`, {
      subjectId: subject,
      gradeLevelId: grade,
      label: 'قديمة',
    });
    expect(kept.statusCode).toBe(200);
    expect(kept.json()).toMatchObject({ subject: { id: subject }, gradeLevel: { id: grade } });
    // The fixture's teacher group also uses them: an empty save still works.
    const back = await c.owner('PATCH', `groups/${c.groupId}`, {});
    expect(back.statusCode).toBe(200);
    const moved = await c.owner('PATCH', `groups/${group.id}`, { subjectId: otherSubject });
    expect(moved.json().subject.id).toBe(otherSubject);
    const reArchived = await c.owner('PATCH', `groups/${group.id}`, { subjectId: subject });
    expect(reArchived.json().code).toBe('GROUP_REFERENCE_INVALID');

    // Students: the same rule for the grade.
    const newStudent = await c.owner('POST', 'students', {
      nameAr: 'طالب جديد',
      gradeLevelId: grade,
      guardian: {
        phone: '01299999999',
        relation: 'mother',
        preferredLocale: 'ar',
        whatsappOptIn: false,
      },
    });
    expect([newStudent.statusCode, newStudent.json()]).toEqual([
      400,
      { code: 'STUDENT_REFERENCE_INVALID', details: { field: 'gradeLevelId' } },
    ]);
    const student = await c.owner('PATCH', `students/${studentId}`, {
      gradeLevelId: grade,
      school: 'مدرسة',
    });
    expect(student.statusCode).toBe(200);
    expect(student.json().gradeLevel.id).toBe(grade);
    const toOther = await c.owner('PATCH', `students/${studentId}`, { gradeLevelId: otherGrade });
    expect(toOther.json().gradeLevel.id).toBe(otherGrade);
    const toArchived = await c.owner('PATCH', `students/${studentId}`, { gradeLevelId: grade });
    expect(toArchived.json().code).toBe('STUDENT_REFERENCE_INVALID');
  });
});
