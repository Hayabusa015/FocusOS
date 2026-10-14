import { addDays, daysBetween } from '@shared/dates';
import type { LocalDate } from '@shared/dates';

/**
 * Home maintenance (PLAN §6): things tracked by when they were last done. The next due date is
 * computed from the last-done date and never stored. The wording is deliberately gentle: a late
 * item "was due 3 days ago", never "overdue".
 */
export interface MaintenanceDates {
  lastDone: LocalDate | null;
  intervalDays: number;
  leadDays: number;
}

export type MaintenanceState = 'unknown' | 'overdue' | 'due-soon' | 'ok';

export interface MaintenanceStatus {
  state: MaintenanceState;
  nextDue: LocalDate | null;
  daysSince: number | null;
  daysUntilDue: number | null;
}

export function nextDue(item: MaintenanceDates): LocalDate | null {
  return item.lastDone ? addDays(item.lastDone, item.intervalDays) : null;
}

export function maintenanceStatus(item: MaintenanceDates, today: LocalDate): MaintenanceStatus {
  const due = nextDue(item);
  if (!item.lastDone || !due) {
    return { state: 'unknown', nextDue: null, daysSince: null, daysUntilDue: null };
  }
  const daysSince = daysBetween(item.lastDone, today);
  const daysUntilDue = daysBetween(today, due);
  const state: MaintenanceState =
    daysUntilDue < 0 ? 'overdue' : daysUntilDue <= item.leadDays ? 'due-soon' : 'ok';
  return { state, nextDue: due, daysSince, daysUntilDue };
}

const plural = (n: number, word: string) => `${n} ${word}${n === 1 ? '' : 's'}`;

/** "Last done 47 days ago · due in 43 days" */
export function describeMaintenance(status: MaintenanceStatus): string {
  if (status.daysSince === null || status.daysUntilDue === null) {
    return 'Not done yet · add when you last did it';
  }
  const since =
    status.daysSince === 0
      ? 'Done today'
      : status.daysSince === 1
        ? 'Last done yesterday'
        : `Last done ${plural(status.daysSince, 'day')} ago`;
  const until = status.daysUntilDue;
  const due =
    until > 1
      ? `due in ${plural(until, 'day')}`
      : until === 1
        ? 'due tomorrow'
        : until === 0
          ? 'due today'
          : until === -1
            ? 'was due yesterday'
            : `was due ${plural(-until, 'day')} ago`;
  return `${since} · ${due}`;
}

export interface MaintenanceTemplate {
  key: string;
  name: string;
  intervalDays: number;
  notes: string;
}

/** Starting points to pick from. They are never created automatically, and every value is editable. */
export const MAINTENANCE_TEMPLATES: readonly MaintenanceTemplate[] = [
  {
    key: 'hvac-filter',
    name: 'Replace the HVAC air filter',
    intervalDays: 90,
    notes: 'Size and rating: ',
  },
  { key: 'smoke-co-test', name: 'Test the smoke and CO detectors', intervalDays: 30, notes: '' },
  {
    key: 'smoke-batteries',
    name: 'Replace the smoke detector batteries',
    intervalDays: 365,
    notes: '',
  },
  {
    key: 'fridge-filter',
    name: 'Replace the fridge water filter',
    intervalDays: 180,
    notes: 'Filter model: ',
  },
  { key: 'dryer-vent', name: 'Clean the dryer vent', intervalDays: 365, notes: '' },
  {
    key: 'car-oil',
    name: 'Change the car oil',
    intervalDays: 180,
    notes: 'By date or by mileage: note the mileage here.',
  },
];
