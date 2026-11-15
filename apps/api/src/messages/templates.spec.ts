import { describe, expect, it } from 'vitest';
import { type ExamPayload, type MessagePayload, render } from './templates.js';

const p: MessagePayload = {
  startsAt: '2026-11-21T14:00:00Z', // Saturday 16:00 Cairo
  timezone: 'Africa/Cairo',
  centerAr: 'سنتر النور',
  centerEn: null,
  subjectAr: 'الفيزياء',
  subjectEn: 'Physics',
  students: [
    { nameAr: 'أحمد', nameEn: 'Ahmed' },
    { nameAr: 'مريم', nameEn: null },
  ],
};

describe('message templates', () => {
  it('merges siblings and uses local time with Western digits', () => {
    const ar = render('absence', p, 'ar');
    expect(ar).toContain('سنتر النور: نود إبلاغكم بغياب أحمد و');
    expect(ar).toContain('مريم');
    expect(ar).toMatch(/21/);
    expect(ar).toMatch(/4:00/);
    expect(render('absence', p, 'en')).toBe(
      'سنتر النور: Ahmed and مريم were absent from Physics (Saturday 21 November at 4:00 pm).',
    );
  });

  it('has cancel and move wording in both languages', () => {
    expect(render('session_cancelled', p, 'ar')).toContain('تم إلغاء حصة الفيزياء');
    expect(render('session_moved', { ...p, centerEn: 'Al-Nour' }, 'en')).toBe(
      'Al-Nour: the Physics session has moved to Saturday 21 November at 4:00 pm.',
    );
  });
});

describe('exam result template', () => {
  const exam: ExamPayload = {
    title: 'امتحان الشهر',
    heldOn: '2026-11-21',
    maxScore: 20,
    centerAr: 'سنتر النور',
    centerEn: 'Al-Nour',
    subjectAr: 'الفيزياء',
    subjectEn: 'Physics',
    students: [
      { nameAr: 'أحمد', nameEn: 'Ahmed', score: 18, absent: false },
      { nameAr: 'مريم', nameEn: null, score: null, absent: true },
    ],
  };

  it('lists each sibling with a score or absent, in both languages', () => {
    const ar = render('exam_result', exam, 'ar');
    expect(ar).toContain('سنتر النور: نتيجة امتحان الفيزياء «امتحان الشهر»');
    expect(ar).toContain('أحمد 18/20');
    expect(ar).toContain('مريم غائب');
    expect(render('exam_result', exam, 'en')).toBe(
      'Al-Nour: Physics exam "امتحان الشهر" (21 November): Ahmed 18/20 and مريم absent.',
    );
  });
});
