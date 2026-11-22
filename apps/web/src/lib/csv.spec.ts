import { afterEach, describe, expect, it, vi } from 'vitest';
import { fx } from '@/test/server';
import { downloadCsv, parseCsv, toCsv } from './csv';
import { examRows, readExamCsv } from './exam-csv';

describe('csv', () => {
  it('quotes what needs it, defuses formulas, and reads its own output back', () => {
    const rows = [
      ['a', 'b,c', 'say "hi"', 'two\nlines'],
      ['=SUM(A1)', '-5', '+x', '@me'],
    ];
    const text = toCsv(rows);
    expect(text.startsWith('﻿')).toBe(true);
    expect(text).toContain('"b,c","say ""hi""","two\nlines"\r\n');
    expect(parseCsv(text)).toEqual([rows[0], ["'=SUM(A1)", '-5', "'+x", "'@me"]]);
  });

  it("reads Excel's semicolon files, LF line ends and a last line without one", () => {
    expect(parseCsv('a;b\n1;2\n\n3;"4;5"')).toEqual([
      ['a', 'b'],
      ['1', '2'],
      ['3', '4;5'],
    ]);
    expect(parseCsv('a,b\r\n,\r\n')).toEqual([['a', 'b']]);
  });

  afterEach(() => vi.restoreAllMocks());

  it('downloads a file made in the browser', () => {
    const create = vi.fn(() => 'blob:x');
    const revoke = vi.fn();
    Object.assign(URL, { createObjectURL: create, revokeObjectURL: revoke });
    const click = vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(() => {});
    downloadCsv('grades.csv', [['a']]);
    expect(click).toHaveBeenCalled();
    expect(revoke).toHaveBeenCalledWith('blob:x');
  });
});

describe('exam csv', () => {
  const sheet = fx.examSheet;
  const [first, second, third] = sheet.rows;
  const cells = {
    [first!.studentId]: { score: '18', absent: false },
    [second!.studentId]: { score: '', absent: true },
    [third!.studentId]: { score: '', absent: false },
  };

  it('writes the grid with English names when asked, and reads it back', () => {
    const rows = examRows(sheet, cells, 'en');
    expect(rows[0]).toEqual(['student_id', 'name', 'score', 'absent']);
    expect(rows[2]).toEqual([second!.studentId, second!.nameAr, '', '1']);
    expect(rows[3]![1]).toBe('Omar');
    expect(examRows(sheet, cells, 'ar')[3]![1]).toBe('عمر خالد');
    expect(readExamCsv(toCsv(rows), sheet)).toEqual({ cells, errors: [] });
  });

  it('matches by id in any order, takes absent words, and lists bad lines', () => {
    const text = [
      'Name,SCORE,Student_ID,absent',
      `x,19,${third!.studentId},`,
      `x,,${second!.studentId},غ`,
      `x,21,${first!.studentId},`,
      `x,5,${third!.studentId},`,
      'x,5,not-a-student,',
      `x,abc,${first!.studentId},`,
    ].join('\n');
    expect(readExamCsv(text, sheet)).toEqual({
      cells: {
        [third!.studentId]: { score: '19', absent: false },
        [second!.studentId]: { score: '', absent: true },
      },
      errors: [
        { code: 'badScore', line: 4 },
        { code: 'duplicate', line: 5 },
        { code: 'unknownStudent', line: 6 },
        { code: 'badScore', line: 7 },
      ],
    });
  });

  it('refuses a file without the id and score columns, and reads a file without absent', () => {
    expect(readExamCsv('name\nأحمد', sheet)).toEqual({
      cells: {},
      errors: [{ code: 'missingColumns' }],
    });
    expect(readExamCsv('', sheet).errors).toEqual([{ code: 'missingColumns' }]);
    expect(readExamCsv(`student_id,score\n${first!.studentId}`, sheet)).toEqual({
      cells: { [first!.studentId]: { score: '', absent: false } },
      errors: [],
    });
  });
});
