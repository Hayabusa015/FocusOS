import { describe, expect, it } from 'vitest';
import {
  addDays,
  daysBetween,
  daysInMonth,
  isValidLocalDate,
  isoToLocalDate,
  isoToLocalTime,
  localToIso,
  minutesOfDay,
  startOfWeek,
  toLocalDate,
  weekdayOf,
} from '../../src/shared/dates';

describe('validation', () => {
  it('accepts real dates and rejects impossible ones', () => {
    expect(isValidLocalDate('2026-10-14')).toBe(true);
    expect(isValidLocalDate('2028-02-29')).toBe(true); // leap year
    expect(isValidLocalDate('2026-02-29')).toBe(false);
    expect(isValidLocalDate('2026-13-01')).toBe(false);
    expect(isValidLocalDate('2026-4-5')).toBe(false);
    expect(isValidLocalDate('not a date')).toBe(false);
  });
});

describe('calendar arithmetic', () => {
  it('adds days across month and year ends', () => {
    expect(addDays('2026-01-31', 1)).toBe('2026-02-01');
    expect(addDays('2026-12-31', 1)).toBe('2027-01-01');
    expect(addDays('2028-02-28', 1)).toBe('2028-02-29');
    expect(addDays('2026-03-01', -1)).toBe('2026-02-28');
  });

  it('is never moved by a daylight-saving change (US 2026: Mar 8 and Nov 1)', () => {
    expect(addDays('2026-03-07', 1)).toBe('2026-03-08');
    expect(addDays('2026-03-08', 1)).toBe('2026-03-09');
    expect(addDays('2026-10-31', 1)).toBe('2026-11-01');
    expect(addDays('2026-11-01', 1)).toBe('2026-11-02');
    expect(daysBetween('2026-03-07', '2026-03-09')).toBe(2);
    expect(daysBetween('2026-10-31', '2026-11-02')).toBe(2);
    expect(daysBetween('2026-11-02', '2026-10-31')).toBe(-2);
    expect(daysBetween('2026-01-01', '2027-01-01')).toBe(365);
  });

  it('finds weekdays and the Monday that starts a week', () => {
    expect(weekdayOf('2026-10-14')).toBe(3); // Wednesday
    expect(weekdayOf('2026-10-18')).toBe(0); // Sunday
    expect(startOfWeek('2026-10-14')).toBe('2026-10-12'); // Monday
    expect(startOfWeek('2026-10-12')).toBe('2026-10-12');
    expect(startOfWeek('2026-10-18')).toBe('2026-10-12'); // Sunday belongs to the week before
  });

  it('knows month lengths', () => {
    expect(daysInMonth(2026, 2)).toBe(28);
    expect(daysInMonth(2028, 2)).toBe(29);
    expect(daysInMonth(2026, 4)).toBe(30);
    expect(daysInMonth(2026, 12)).toBe(31);
  });
});

describe('local dates and moments', () => {
  it('turns a local date and time into an instant and back', () => {
    const iso = localToIso('2026-10-14', '15:30');
    expect(isoToLocalDate(iso)).toBe('2026-10-14');
    expect(isoToLocalTime(iso)).toBe('15:30');
    // October 14 is daylight time in Ohio: 15:30 local is 19:30 UTC.
    expect(iso).toBe('2026-10-14T19:30:00.000Z');
  });

  it('keeps the same wall-clock time on either side of a daylight-saving change', () => {
    expect(isoToLocalTime(localToIso('2026-03-07', '09:00'))).toBe('09:00');
    expect(isoToLocalTime(localToIso('2026-03-09', '09:00'))).toBe('09:00');
    expect(localToIso('2026-03-07', '09:00')).toBe('2026-03-07T14:00:00.000Z'); // EST
    expect(localToIso('2026-03-09', '09:00')).toBe('2026-03-09T13:00:00.000Z'); // EDT
  });

  it('does not fail on a time that does not exist (02:30 on spring-forward day)', () => {
    expect(() => localToIso('2026-03-08', '02:30')).not.toThrow();
  });

  it("reads today's date in the machine's timezone", () => {
    expect(toLocalDate(new Date(2026, 9, 14, 23, 59))).toBe('2026-10-14');
    expect(toLocalDate(new Date(2026, 9, 15, 0, 1))).toBe('2026-10-15');
  });

  it('rejects bad times', () => {
    expect(() => localToIso('2026-10-14', '25:00')).toThrow();
    expect(minutesOfDay('07:30')).toBe(450);
    expect(() => minutesOfDay('7:30')).toThrow();
  });
});
