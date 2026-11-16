import type { CurriculumItem, Group } from '@dafter/contracts';
import { clockLabel } from '@/lib/time';

/** The Egyptian week starts on Saturday. Values are getDay() numbers (0 = Sunday). */
export const WEEK: readonly number[] = [6, 0, 1, 2, 3, 4, 5];

// 2023-01-01 was a Sunday, so day d of that week has getDay() === d.
export const weekdayName = (lang: string, day: number) =>
  new Intl.DateTimeFormat(lang, { weekday: 'long', timeZone: 'UTC' }).format(
    Date.UTC(2023, 0, 1 + day),
  );

export const itemName = (item: CurriculumItem, lang: string) =>
  lang === 'en' ? item.nameEn : item.nameAr;

/** Slots in week order (Saturday first), for display. */
export const sortedSlots = (group: Group) =>
  [...group.slots].sort(
    (a, b) =>
      WEEK.indexOf(a.weekday) - WEEK.indexOf(b.weekday) || a.startTime.localeCompare(b.startTime),
  );

/**
 * A name that tells groups apart: subject · its short label, or else its first slot · teacher
 * ("الفيزياء · السبت 4:00 م · منى حسن"). Without the slot, a teacher's groups of one subject
 * all read the same (audit 3 G5). Forms that mix grades pass `withGrade`.
 */
export const groupName = (group: Group, lang: string, withGrade = false) => {
  const first = sortedSlots(group)[0];
  const when =
    group.label ??
    (first && `${weekdayName(lang, first.weekday)} ${clockLabel(first.startTime, lang)}`);
  return [
    itemName(group.subject, lang),
    withGrade && itemName(group.gradeLevel, lang),
    when,
    group.teacherName,
  ]
    .filter(Boolean)
    .join(' · ');
};
