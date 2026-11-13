import type { Tx } from './tenant.js';
import { gradeLevels, subjects } from './schema.js';

/** The Egyptian school curriculum every new workspace starts with; each workspace can edit its copy. */
export const GRADE_LEVELS: [ar: string, en: string][] = [
  ['الصف الأول الابتدائي', 'Primary 1'],
  ['الصف الثاني الابتدائي', 'Primary 2'],
  ['الصف الثالث الابتدائي', 'Primary 3'],
  ['الصف الرابع الابتدائي', 'Primary 4'],
  ['الصف الخامس الابتدائي', 'Primary 5'],
  ['الصف السادس الابتدائي', 'Primary 6'],
  ['الصف الأول الإعدادي', 'Preparatory 1'],
  ['الصف الثاني الإعدادي', 'Preparatory 2'],
  ['الصف الثالث الإعدادي', 'Preparatory 3'],
  ['الصف الأول الثانوي', 'Secondary 1'],
  ['الصف الثاني الثانوي', 'Secondary 2'],
  ['الصف الثالث الثانوي', 'Secondary 3'],
];

export const SUBJECTS: [ar: string, en: string][] = [
  ['اللغة العربية', 'Arabic'],
  ['اللغة الإنجليزية', 'English'],
  ['الرياضيات', 'Mathematics'],
  ['العلوم', 'Science'],
  ['الدراسات الاجتماعية', 'Social Studies'],
  ['الفيزياء', 'Physics'],
  ['الكيمياء', 'Chemistry'],
  ['الأحياء', 'Biology'],
  ['الجيولوجيا', 'Geology'],
  ['التاريخ', 'History'],
  ['الجغرافيا', 'Geography'],
  ['الفلسفة والمنطق', 'Philosophy and Logic'],
  ['علم النفس والاجتماع', 'Psychology and Sociology'],
  ['اللغة الفرنسية', 'French'],
  ['اللغة الألمانية', 'German'],
  ['الإحصاء', 'Statistics'],
];

const rows = (workspaceId: string, list: [string, string][]) =>
  list.map(([nameAr, nameEn], i) => ({ workspaceId, nameAr, nameEn, sortOrder: i + 1 }));

/** Copies the curriculum into a workspace, inside the transaction that creates it. */
export async function insertCurriculum(tx: Tx, workspaceId: string) {
  await tx.insert(subjects).values(rows(workspaceId, SUBJECTS));
  await tx.insert(gradeLevels).values(rows(workspaceId, GRADE_LEVELS));
}
