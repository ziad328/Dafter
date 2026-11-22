/**
 * Small CSV helpers for spreadsheets people open in Excel or Google Sheets. Files are made in the
 * browser (rule 11: nothing on the server disk), UTF-8 with a BOM so Excel shows Arabic.
 */

const BOM = '﻿';

/**
 * A cell that starts with = + - @ (or a tab / carriage return) runs as a formula in a spreadsheet;
 * a leading ' makes it plain text. Numbers are left alone so scores stay numbers.
 */
const safe = (value: string) =>
  /^[=+\-@\t\r]/.test(value) && !/^-?\d+(\.\d+)?$/.test(value) ? `'${value}` : value;

const quote = (value: string) => {
  const v = safe(value);
  return /[",\r\n]/.test(v) ? `"${v.replace(/"/g, '""')}"` : v;
};

/** Rows to CSV text: comma-separated, CRLF line ends, BOM first. */
export const toCsv = (rows: string[][]) =>
  BOM + rows.map((r) => r.map(quote).join(',')).join('\r\n') + '\r\n';

/**
 * CSV text to rows. Handles quotes, "" inside quotes, CRLF or LF, a BOM, and Excel's ";" files
 * (used where the comma is the decimal mark). Blank lines are dropped.
 */
export function parseCsv(text: string): string[][] {
  const src = text.startsWith(BOM) ? text.slice(1) : text;
  const firstLine = src.split(/\r?\n/, 1)[0]!;
  const sep = firstLine.includes(';') && !firstLine.includes(',') ? ';' : ',';
  const rows: string[][] = [];
  let row: string[] = [];
  let cell = '';
  let quoted = false;
  for (let i = 0; i < src.length; i++) {
    const ch = src[i]!;
    if (quoted) {
      if (ch === '"' && src[i + 1] === '"') {
        cell += '"';
        i++;
      } else if (ch === '"') quoted = false;
      else cell += ch;
    } else if (ch === '"') quoted = true;
    else if (ch === sep) {
      row.push(cell);
      cell = '';
    } else if (ch === '\n' || ch === '\r') {
      if (ch === '\r' && src[i + 1] === '\n') i++;
      row.push(cell);
      rows.push(row);
      row = [];
      cell = '';
    } else cell += ch;
  }
  if (cell !== '' || row.length) {
    row.push(cell);
    rows.push(row);
  }
  return rows.filter((r) => r.some((c) => c.trim() !== ''));
}

/** Hands the viewer a file to save, made in the browser. */
export function downloadCsv(name: string, rows: string[][]) {
  const url = URL.createObjectURL(new Blob([toCsv(rows)], { type: 'text/csv;charset=utf-8' }));
  const a = document.createElement('a');
  a.href = url;
  a.download = name;
  a.click();
  URL.revokeObjectURL(url);
}
