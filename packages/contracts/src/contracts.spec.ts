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
