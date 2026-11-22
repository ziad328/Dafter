import { mkdtempSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, expect, it, vi } from 'vitest';
import { registerRequest } from './auth.js';
import { saveExamResultsRequest } from './exams.js';
import { ERROR_CODES, ERROR_STATUS, errorResponse } from './errors.js';
import { createGroupRequest, groupSlot } from './groups.js';
import { normalizeArabic } from './normalize.js';
import { buildOpenApi } from './openapi.js';
import { OPENAPI_FILE, writeOpenApi } from './scripts/write-openapi.js';
import { listSessionsQuery, moveSessionRequest } from './sessions.js';
import { cashSummaryQuery, trendsQuery } from './stats.js';
import { createStudentRequest, updateStudentRequest } from './students.js';
import { createInviteRequest, updateMemberRequest } from './workspaces.js';

describe('normalizeArabic (rule 6)', () => {
  it('strips diacritics and tatweel and folds the letter variants', () => {
    expect(normalizeArabic('أَحْمَـــد')).toBe('احمد');
    expect(normalizeArabic('إسلام آدم')).toBe('اسلام ادم');
    expect(normalizeArabic('فاطمة مصطفى')).toBe('فاطمه مصطفي');
    expect(normalizeArabic('٠١٠٢٣')).toBe('01023');
  });
});

describe('errors', () => {
  it('maps every code to an HTTP status and accepts it in an error response', () => {
    for (const code of ERROR_CODES) {
      expect(ERROR_STATUS[code]).toBeGreaterThanOrEqual(400);
      expect(errorResponse.parse({ code })).toMatchObject({ code });
    }
  });
});

describe('OpenAPI', () => {
  it('describes every route, and the committed openapi.json is current', () => {
    const doc = buildOpenApi();
    expect(Object.keys(doc.paths ?? {}).length).toBeGreaterThan(30);
    expect(JSON.parse(readFileSync(OPENAPI_FILE, 'utf8'))).toEqual(JSON.parse(JSON.stringify(doc)));
  });

  it('writes the document to a file', () => {
    vi.spyOn(console, 'log').mockImplementation(() => {});
    const out = join(mkdtempSync(join(tmpdir(), 'openapi-')), 'openapi.json');
    writeOpenApi(out);
    expect(JSON.parse(readFileSync(out, 'utf8')).openapi).toMatch(/^3\./);
  });
});

describe('staff requests', () => {
  const id = '0b6f1b5e-2f4c-4a8e-9b1a-3c5d7e9f1a2b';
  it('lets only an assistant invite name teachers', () => {
    expect(
      createInviteRequest.safeParse({ role: 'assistant', teacherMembershipIds: [id] }).success,
    ).toBe(true);
    expect(createInviteRequest.safeParse({ role: 'teacher' }).success).toBe(true);
    expect(
      createInviteRequest.safeParse({ role: 'teacher', teacherMembershipIds: [id] }).success,
    ).toBe(false);
  });

  it('takes a new role or a removal, not both or neither', () => {
    expect(updateMemberRequest.safeParse({ role: 'owner' }).success).toBe(true);
    expect(updateMemberRequest.safeParse({ status: 'removed' }).success).toBe(true);
    expect(updateMemberRequest.safeParse({}).success).toBe(false);
    expect(updateMemberRequest.safeParse({ role: 'teacher', status: 'removed' }).success).toBe(
      false,
    );
  });
});

describe('schema rules', () => {
  const issues = (r: { success: boolean; error?: { issues: { message: string }[] } }) =>
    r.success ? [] : r.error!.issues.map((i) => i.message);

  it('an exam result is a score or absent, once per student', () => {
    const id = crypto.randomUUID();
    const save = (results: object[]) => issues(saveExamResultsRequest.safeParse({ results }));
    expect(save([{ studentId: id, score: 18, absent: false }])).toEqual([]);
    expect(save([{ studentId: id, score: null, absent: true }])).toEqual([]);
    expect(save([{ studentId: id, score: 5, absent: true }])).toContain('SCORE_OR_ABSENT');
    expect(save([{ studentId: id, score: null, absent: false }])).toContain('SCORE_OR_ABSENT');
    const row = { studentId: id, score: 1, absent: false };
    expect(save([row, row])).toContain('DUPLICATE_STUDENT');
  });

  it('register needs a phone or an email', () => {
    const base = { name: 'منى', password: 'correct horse' };
    expect(issues(registerRequest.safeParse(base))).toContain('phone or email required');
    expect(registerRequest.safeParse({ ...base, phone: '01000000001' }).success).toBe(true);
  });

  it('a slot ends after it starts, and slots of one day do not overlap', () => {
    const slot = { weekday: 6, startTime: '16:00', endTime: '17:30' };
    expect(issues(groupSlot.safeParse({ ...slot, endTime: '15:00' }))).toContain(
      'SLOT_ENDS_BEFORE_START',
    );
    const group = (slots: object[]) =>
      createGroupRequest.safeParse({
        subjectId: crypto.randomUUID(),
        gradeLevelId: crypto.randomUUID(),
        slots,
      });
    expect(issues(group([slot, { ...slot, startTime: '17:00', endTime: '18:00' }]))).toContain(
      'SLOT_OVERLAP',
    );
    expect(group([slot, { ...slot, weekday: 0 }]).success).toBe(true);
  });

  it('a session range is ordered and at most 31 days; a move ends after it starts', () => {
    expect(issues(listSessionsQuery.safeParse({ from: '2026-11-10', to: '2026-11-01' }))).toContain(
      'RANGE_ENDS_BEFORE_START',
    );
    expect(issues(listSessionsQuery.safeParse({ from: '2026-11-01', to: '2026-12-15' }))).toContain(
      'RANGE_TOO_LONG',
    );
    expect(listSessionsQuery.safeParse({ from: '2026-11-01', to: '2026-11-30' }).success).toBe(
      true,
    );
    expect(
      issues(
        moveSessionRequest.safeParse({ date: '2026-11-24', startTime: '18:00', endTime: '17:00' }),
      ),
    ).toContain('SLOT_ENDS_BEFORE_START');
  });
});

describe('student parents', () => {
  const parent = (phone: string) => ({
    phone,
    relation: 'mother',
    preferredLocale: 'ar',
    whatsappOptIn: true,
  });
  const issues = (r: { error?: { issues: { path: PropertyKey[]; message: string }[] } }) =>
    r.error?.issues.map((i) => [i.path.join('.'), i.message]);

  it('takes extra parents with the primary, never the same phone twice', () => {
    const base = { nameAr: 'نور', gradeLevelId: '00000000-0000-4000-8000-000000000001' };
    expect(
      createStudentRequest.safeParse({
        ...base,
        guardian: parent('01200000001'),
        extraGuardians: [parent('01200000002')],
      }).success,
    ).toBe(true);
    expect(
      issues(
        createStudentRequest.safeParse({
          ...base,
          guardian: parent('01200000001'),
          extraGuardians: [parent('01200000002'), parent('01200000001'), parent('01200000002')],
        }),
      ),
    ).toEqual([
      ['extraGuardians.1.phone', 'GUARDIAN_DUPLICATE'],
      ['extraGuardians.2.phone', 'GUARDIAN_DUPLICATE'],
    ]);
    expect(
      issues(updateStudentRequest.safeParse({ extraGuardians: [parent('01200000002')] })),
    ).toEqual([['guardian', 'GUARDIAN_REQUIRED']]);
    expect(updateStudentRequest.safeParse({ nameAr: 'نور' }).success).toBe(true);
  });
});

describe('dashboard range', () => {
  it('takes both dates or neither, in order, up to a year', () => {
    const ok = (q: object) => trendsQuery.safeParse(q).success;
    expect(ok({})).toBe(true);
    expect(ok({ from: '2026-01-01', to: '2026-12-31', archived: 'true' })).toBe(true);
    expect(ok({ from: '2026-01-01' })).toBe(false);
    expect(ok({ to: '2026-01-01' })).toBe(false);
    expect(ok({ from: '2026-02-01', to: '2026-01-01' })).toBe(false);
    expect(ok({ from: '2025-12-31', to: '2027-01-01' })).toBe(false);
  });
});

describe('cash summary range', () => {
  it('takes one day, or a first and last day in order, up to 31 days', () => {
    const ok = (q: object) => cashSummaryQuery.safeParse(q).success;
    expect(ok({})).toBe(true);
    expect(ok({ date: '2026-11-01', to: '2026-11-30' })).toBe(true);
    expect(ok({ date: '2026-11-01', to: '2026-12-01' })).toBe(true);
    expect(ok({ to: '2026-11-01' })).toBe(false);
    expect(ok({ date: '2026-11-02', to: '2026-11-01' })).toBe(false);
    expect(ok({ date: '2026-11-01', to: '2026-12-02' })).toBe(false);
    expect(ok({ userId: 'nope' })).toBe(false);
  });
});
