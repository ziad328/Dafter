/**
 * The one Arabic search normalizer (rule 6), used on save (students.name_search) and on query.
 * Strips diacritics and tatweel; أ إ آ ٱ → ا, ة → ه, ى → ي; Arabic-Indic digits → 0-9;
 * lowercases Latin and collapses spaces.
 */
export function normalizeArabic(text: string): string {
  return text
    .replace(/[ً-ٰٟـ]/g, '')
    .replace(/[أإآٱ]/g, 'ا')
    .replace(/ة/g, 'ه')
    .replace(/ى/g, 'ي')
    .replace(/[٠-٩]/g, (d) => String(d.charCodeAt(0) - 0x660))
    .toLowerCase()
    .replace(/\s+/g, ' ')
    .trim();
}
