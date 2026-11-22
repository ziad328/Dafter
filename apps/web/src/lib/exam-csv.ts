import type { ExamSheet } from '@dafter/contracts';
import { parseCsv } from './csv';

/** A grid cell as the screen keeps it: the score as typed, or absent. */
export type Cell = { score: string; absent: boolean };

/** Fixed column names (the file is data, not UI), so a file made in Arabic imports in English. */
export const COLUMNS = ['student_id', 'name', 'score', 'absent'] as const;

// "Absent" as people type it in a spreadsheet: 1, x, yes, true, نعم, غ (غائب).
const ABSENT = new Set(['1', 'x', 'yes', 'true', 'نعم', 'غ', 'غائب']);

export type CsvError =
  { code: 'missingColumns' } | { code: 'unknownStudent' | 'badScore' | 'duplicate'; line: number };

/** The grid as rows: the header, then one row per student, in the grid's order. */
export function examRows(sheet: ExamSheet, cells: Record<string, Cell>, lang: string) {
  return [
    [...COLUMNS],
    ...sheet.rows.map((r) => {
      const c = cells[r.studentId]!;
      return [
        r.studentId,
        lang === 'en' && r.nameEn ? r.nameEn : r.nameAr,
        c.absent ? '' : c.score,
        c.absent ? '1' : '',
      ];
    }),
  ];
}

/**
 * A filled-in file back to grid cells, matched by student_id (names may be retyped or sorted).
 * A blank score that isn't absent clears the cell; students not in the file keep theirs. Lines
 * with a problem are skipped and listed (1-based, the header is line 1); the rest still apply.
 */
export function readExamCsv(
  text: string,
  sheet: ExamSheet,
): { cells: Record<string, Cell>; errors: CsvError[] } {
  const [header = [], ...lines] = parseCsv(text);
  const col = (name: (typeof COLUMNS)[number]) =>
    header.findIndex((h) => h.trim().toLowerCase() === name);
  const [idCol, scoreCol, absentCol] = [col('student_id'), col('score'), col('absent')];
  if (idCol < 0 || scoreCol < 0) return { cells: {}, errors: [{ code: 'missingColumns' }] };

  const known = new Set(sheet.rows.map((r) => r.studentId));
  const cells: Record<string, Cell> = {};
  const errors: CsvError[] = [];
  lines.forEach((cols, i) => {
    const line = i + 2;
    const id = (cols[idCol] ?? '').trim();
    const score = (cols[scoreCol] ?? '').trim();
    const absent = absentCol >= 0 && ABSENT.has((cols[absentCol] ?? '').trim().toLowerCase());
    if (!known.has(id)) return errors.push({ code: 'unknownStudent', line });
    if (cells[id]) return errors.push({ code: 'duplicate', line });
    const valid = score === '' || (/^\d+$/.test(score) && Number(score) <= sheet.exam.maxScore);
    if (!absent && !valid) return errors.push({ code: 'badScore', line });
    cells[id] = { score: absent ? '' : score, absent };
  });
  return { cells, errors };
}
