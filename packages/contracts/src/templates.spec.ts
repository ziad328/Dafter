import { describe, expect, it } from 'vitest';
import {
  DEFAULT_TEMPLATES,
  TEMPLATE_PLACEHOLDERS,
  fillTemplate,
  unknownPlaceholder,
  updateMessageTemplateRequest,
} from './templates.js';

describe('message templates', () => {
  it('fills placeholders in one pass and keeps unknown ones as typed', () => {
    expect(fillTemplate('{a} and {b}, {a} again', { a: 'X', b: 'Y' })).toBe('X and Y, X again');
    // A value that looks like a placeholder is not expanded again.
    expect(fillTemplate('{students} at {center}', { students: '{center}', center: 'Nour' })).toBe(
      '{center} at Nour',
    );
    expect(fillTemplate('{nope} {x}', { x: '1' })).toBe('{nope} 1');
    expect(fillTemplate('no placeholders', {})).toBe('no placeholders');
  });

  it('finds the first placeholder a trigger does not offer', () => {
    expect(unknownPlaceholder('absence', 'غياب {students} في {subject}')).toBeUndefined();
    expect(unknownPlaceholder('session_cancelled', '{students} {subject} {month}')).toBe(
      'students',
    );
    expect(unknownPlaceholder('fee_overdue', 'شكرا')).toBeUndefined();
    expect(unknownPlaceholder('absence', 'غياب { students }')).toBe(' students ');
    expect(unknownPlaceholder('absence', 'غياب {}')).toBe('');
  });

  it('defaults use only their own placeholders, in both languages', () => {
    for (const [trigger, texts] of Object.entries(DEFAULT_TEMPLATES))
      for (const text of Object.values(texts))
        expect(unknownPlaceholder(trigger as keyof typeof TEMPLATE_PLACEHOLDERS, text)).toBe(
          undefined,
        );
  });

  it('trims the text, caps it at 500 characters and allows null', () => {
    expect(updateMessageTemplateRequest.parse({ ar: '  نص  ', en: null })).toEqual({
      ar: 'نص',
      en: null,
    });
    expect(updateMessageTemplateRequest.safeParse({ ar: 'x'.repeat(501), en: null }).success).toBe(
      false,
    );
  });
});
