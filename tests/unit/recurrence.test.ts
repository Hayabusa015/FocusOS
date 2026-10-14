import { describe, expect, it } from 'vitest';
import type { Recurrence } from '../../src/shared/core';
import {
  describeRecurrence,
  nextDueAfterCompletion,
  nextOccurrence,
} from '../../src/main/domain/recurrence';

const next = (rule: Recurrence, due: string) => nextOccurrence(rule, due);

describe('nextOccurrence', () => {
  it('daily and every N days', () => {
    expect(next({ freq: 'daily' }, '2026-10-14')).toBe('2026-10-15');
    expect(next({ freq: 'daily' }, '2026-12-31')).toBe('2027-01-01');
    expect(next({ freq: 'every_n_days', n: 3 }, '2026-12-30')).toBe('2027-01-02');
    expect(next({ freq: 'every_n_days', n: 14 }, '2026-03-01')).toBe('2026-03-15');
  });

  it('weekdays skip the weekend', () => {
    expect(next({ freq: 'weekdays' }, '2026-10-15')).toBe('2026-10-16'); // Thu to Fri
    expect(next({ freq: 'weekdays' }, '2026-10-16')).toBe('2026-10-19'); // Fri to Mon
    expect(next({ freq: 'weekdays' }, '2026-10-17')).toBe('2026-10-19'); // Sat to Mon
    expect(next({ freq: 'weekdays' }, '2026-10-18')).toBe('2026-10-19'); // Sun to Mon
  });

  it('weekly moves to the next chosen weekday, strictly after the due date', () => {
    const monWed: Recurrence = { freq: 'weekly', days: [1, 3] };
    expect(next(monWed, '2026-10-12')).toBe('2026-10-14'); // Mon to Wed
    expect(next(monWed, '2026-10-14')).toBe('2026-10-19'); // Wed to next Mon
    expect(next(monWed, '2026-10-15')).toBe('2026-10-19'); // Thu to Mon
    expect(next({ freq: 'weekly', days: [5] }, '2026-10-16')).toBe('2026-10-23'); // same day, a week on
    expect(next({ freq: 'weekly', days: [0] }, '2026-10-14')).toBe('2026-10-18'); // Sunday
  });

  it('monthly keeps to its day and clamps to short months', () => {
    expect(next({ freq: 'monthly', day: 15 }, '2026-10-15')).toBe('2026-11-15');
    expect(next({ freq: 'monthly', day: 15 }, '2026-12-15')).toBe('2027-01-15'); // year end
    expect(next({ freq: 'monthly', day: 31 }, '2026-01-31')).toBe('2026-02-28'); // short month
    expect(next({ freq: 'monthly', day: 31 }, '2026-02-28')).toBe('2026-03-31'); // back to the 31st
    expect(next({ freq: 'monthly', day: 31 }, '2026-03-31')).toBe('2026-04-30');
    expect(next({ freq: 'monthly', day: 31 }, '2028-01-31')).toBe('2028-02-29'); // leap year
    expect(next({ freq: 'monthly', day: 29 }, '2027-01-29')).toBe('2027-02-28');
    expect(next({ freq: 'monthly', day: 30 }, '2026-01-30')).toBe('2026-02-28');
  });

  it('monthly takes this month first when its day is still ahead', () => {
    expect(next({ freq: 'monthly', day: 20 }, '2026-10-05')).toBe('2026-10-20');
  });

  it('crosses daylight-saving changes without drifting', () => {
    expect(next({ freq: 'daily' }, '2026-03-07')).toBe('2026-03-08');
    expect(next({ freq: 'daily' }, '2026-03-08')).toBe('2026-03-09');
    expect(next({ freq: 'weekly', days: [0] }, '2026-03-01')).toBe('2026-03-08');
    expect(next({ freq: 'weekly', days: [0] }, '2026-03-08')).toBe('2026-03-15');
    expect(next({ freq: 'weekly', days: [0] }, '2026-10-25')).toBe('2026-11-01');
    expect(next({ freq: 'weekly', days: [0] }, '2026-11-01')).toBe('2026-11-08');
  });
});

describe('nextDueAfterCompletion', () => {
  it('is simply the next occurrence when completed on time', () => {
    expect(nextDueAfterCompletion({ freq: 'daily' }, '2026-10-14', '2026-10-14')).toBe(
      '2026-10-15',
    );
    expect(nextDueAfterCompletion({ freq: 'weekly', days: [1] }, '2026-10-12', '2026-10-12')).toBe(
      '2026-10-19',
    );
  });

  it('is computed from the due date, not the completion date', () => {
    // Done on Wednesday, but the series is every Monday: the next one is still a Monday.
    expect(nextDueAfterCompletion({ freq: 'weekly', days: [1] }, '2026-10-12', '2026-10-14')).toBe(
      '2026-10-19',
    );
  });

  it('skips occurrences already missed, so there is no pile of overdue copies', () => {
    // Daily task due Oct 1, finished Oct 14: one instance due today, not thirteen overdue ones.
    expect(nextDueAfterCompletion({ freq: 'daily' }, '2026-10-01', '2026-10-14')).toBe(
      '2026-10-14',
    );
    // Weekly Monday task due Oct 5, finished Oct 14 (a Wednesday): next is Monday Oct 19.
    expect(nextDueAfterCompletion({ freq: 'weekly', days: [1] }, '2026-10-05', '2026-10-14')).toBe(
      '2026-10-19',
    );
    // Monthly on the 1st, due Aug 1, finished Oct 14: next is Nov 1.
    expect(nextDueAfterCompletion({ freq: 'monthly', day: 1 }, '2026-08-01', '2026-10-14')).toBe(
      '2026-11-01',
    );
  });
});

describe('describeRecurrence', () => {
  it('reads naturally', () => {
    expect(describeRecurrence({ freq: 'daily' })).toBe('Every day');
    expect(describeRecurrence({ freq: 'weekdays' })).toBe('Every weekday');
    expect(describeRecurrence({ freq: 'weekly', days: [3, 1] })).toBe('Every Mon, Wed');
    expect(describeRecurrence({ freq: 'monthly', day: 1 })).toBe('Monthly on the 1st');
    expect(describeRecurrence({ freq: 'monthly', day: 22 })).toBe('Monthly on the 22nd');
    expect(describeRecurrence({ freq: 'monthly', day: 3 })).toBe('Monthly on the 3rd');
    expect(describeRecurrence({ freq: 'monthly', day: 11 })).toBe('Monthly on the 11th');
    expect(describeRecurrence({ freq: 'every_n_days', n: 3 })).toBe('Every 3 days');
  });
});
