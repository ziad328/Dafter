import { describe, expect, it } from 'vitest';
import { addDays, localDate, localTime, monthLabel, weekStart } from './time';

describe('time helpers', () => {
  it('finds the Saturday that starts the week', () => {
    expect(weekStart('2026-11-21')).toBe('2026-11-21'); // Saturday
    expect(weekStart('2026-11-27')).toBe('2026-11-21'); // Friday
    expect(weekStart('2026-11-22')).toBe('2026-11-21'); // Sunday
  });

  it('adds days across months', () => {
    expect(addDays('2026-11-28', 7)).toBe('2026-12-05');
    expect(addDays('2026-12-05', -7)).toBe('2026-11-28');
  });

  it('shows UTC instants in the workspace timezone, across DST', () => {
    expect(localTime('2026-11-21T14:00:00Z', 'Africa/Cairo')).toBe('16:00');
    expect(localTime('2027-05-01T13:00:00Z', 'Africa/Cairo')).toBe('16:00');
    // 23:30 UTC on Friday is already Saturday in Cairo.
    expect(localDate('2026-11-20T23:30:00Z', 'Africa/Cairo')).toBe('2026-11-21');
  });

  it('names a billing month', () => {
    expect(monthLabel('2026-11', 'en')).toBe('November 2026');
    expect(monthLabel('2026-11', 'ar')).toBe('نوفمبر 2026');
  });
});
