import { addDays, daysInMonth, parseLocalDate, WEEKDAY_SHORT, weekdayOf } from '@shared/dates';
import type { LocalDate } from '@shared/dates';
import type { Recurrence } from '@shared/core';

/**
 * Recurrence (PLAN §6) is deliberately simpler than iCal's RRULE. The next date is computed from
 * the DUE date, not the completion date, so a series keeps its rhythm ("every Monday" stays on
 * Mondays even when one was done on a Wednesday).
 */

function monthlyCandidate(year: number, month: number, day: number): LocalDate {
  const clamped = Math.min(day, daysInMonth(year, month));
  return `${String(year).padStart(4, '0')}-${String(month).padStart(2, '0')}-${String(clamped).padStart(2, '0')}`;
}

/** The first occurrence strictly after `due`. */
export function nextOccurrence(rule: Recurrence, due: LocalDate): LocalDate {
  switch (rule.freq) {
    case 'daily':
      return addDays(due, 1);
    case 'every_n_days':
      return addDays(due, rule.n);
    case 'weekdays': {
      for (let i = 1; i <= 7; i++) {
        const candidate = addDays(due, i);
        const weekday = weekdayOf(candidate);
        if (weekday >= 1 && weekday <= 5) return candidate;
      }
      throw new Error('unreachable');
    }
    case 'weekly': {
      for (let i = 1; i <= 7; i++) {
        const candidate = addDays(due, i);
        if (rule.days.includes(weekdayOf(candidate))) return candidate;
      }
      throw new Error('unreachable');
    }
    case 'monthly': {
      const { y, m, d } = parseLocalDate(due);
      // This month's date counts if it is still ahead of `due`; otherwise it is next month's.
      const thisMonth = monthlyCandidate(y, m, rule.day);
      if (parseLocalDate(thisMonth).d > d) return thisMonth;
      return m === 12 ? monthlyCandidate(y + 1, 1, rule.day) : monthlyCandidate(y, m + 1, rule.day);
    }
  }
}

/**
 * The due date of the next instance when `due` is completed on `today`.
 *
 * It is `nextOccurrence(due)`, but occurrences the user has already missed are skipped, so
 * finishing a daily task a week late gives one instance due today, not a week of overdue
 * copies. The series still stays on its own schedule, because every step starts from the due date.
 */
export function nextDueAfterCompletion(
  rule: Recurrence,
  due: LocalDate,
  today: LocalDate,
): LocalDate {
  let next = nextOccurrence(rule, due);
  // The loop always advances, and a missed series is at most a few years long in practice.
  for (let guard = 0; next < today && guard < 5000; guard++) next = nextOccurrence(rule, next);
  return next;
}

const ordinal = (n: number) => {
  const tens = n % 100;
  if (tens >= 11 && tens <= 13) return `${n}th`;
  return `${n}${({ 1: 'st', 2: 'nd', 3: 'rd' } as Record<number, string>)[n % 10] ?? 'th'}`;
};

export function describeRecurrence(rule: Recurrence): string {
  switch (rule.freq) {
    case 'daily':
      return 'Every day';
    case 'weekdays':
      return 'Every weekday';
    case 'weekly': {
      const names = [...rule.days].sort((a, b) => a - b).map((d) => WEEKDAY_SHORT[d]);
      return `Every ${names.join(', ')}`;
    }
    case 'monthly':
      return `Monthly on the ${ordinal(rule.day)}`;
    case 'every_n_days':
      return rule.n === 1 ? 'Every day' : `Every ${rule.n} days`;
  }
}
