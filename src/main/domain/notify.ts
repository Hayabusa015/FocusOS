import {
  isoToLocalDate,
  isoToLocalTime,
  minutesOfDay,
  toLocalDate,
  toLocalTime,
} from '@shared/dates';
import type { MaintenanceState } from './maintenance';

/**
 * Which Windows notifications are due right now (PLAN §10): due times, block starts and
 * maintenance items that come due. Pure, so the schedule is testable without a clock or a screen.
 * Quiet hours silence everything, and nothing fires more than once.
 */
export interface NotifyTask {
  id: string;
  title: string;
  status: string;
  dueDate: string | null;
  dueTime: string | null;
  scheduledStart: string | null;
}

export interface NotifyMaintenance {
  id: string;
  name: string;
  state: MaintenanceState;
  statusText: string;
}

export interface Notice {
  /** Stable per event, so a notice is sent once. */
  key: string;
  title: string;
  body: string;
}

export interface NoticeInput {
  now: Date;
  tasks: NotifyTask[];
  maintenance: NotifyMaintenance[];
  quiet: { start: string; end: string };
  sent: ReadonlySet<string>;
  /** A due time or block start older than this is stale, not worth interrupting for. */
  staleAfterMinutes?: number;
  /** Maintenance reminders go out once a day, no earlier than this time. */
  maintenanceFrom?: string;
}

/** True when `time` falls in the quiet window, which may run past midnight (21:30 to 06:30). */
export function inQuietHours(time: string, quiet: { start: string; end: string }): boolean {
  const t = minutesOfDay(time);
  const start = minutesOfDay(quiet.start);
  const end = minutesOfDay(quiet.end);
  if (start === end) return false;
  return start < end ? t >= start && t < end : t >= start || t < end;
}

export function dueNotices(input: NoticeInput): Notice[] {
  const { now, quiet, sent } = input;
  const stale = input.staleAfterMinutes ?? 15;
  const today = toLocalDate(now);
  const nowTime = toLocalTime(now);
  if (inQuietHours(nowTime, quiet)) return [];
  const nowMinutes = minutesOfDay(nowTime);

  const notices: Notice[] = [];
  const add = (notice: Notice) => {
    if (!sent.has(notice.key)) notices.push(notice);
  };

  for (const task of input.tasks) {
    if (task.status === 'done' || task.status === 'someday') continue;

    if (task.dueDate === today && task.dueTime) {
      const age = nowMinutes - minutesOfDay(task.dueTime);
      if (age >= 0 && age <= stale) {
        add({ key: `due:${task.id}:${today}:${task.dueTime}`, title: 'Due now', body: task.title });
      }
    }

    if (task.scheduledStart && isoToLocalDate(task.scheduledStart) === today) {
      const start = isoToLocalTime(task.scheduledStart);
      const age = nowMinutes - minutesOfDay(start);
      if (age >= 0 && age <= stale) {
        add({
          key: `block:${task.id}:${task.scheduledStart}`,
          title: 'Starting now',
          body: task.title,
        });
      }
    }
  }

  if (nowMinutes >= minutesOfDay(input.maintenanceFrom ?? '08:00')) {
    for (const item of input.maintenance) {
      if (item.state === 'due-soon' || item.state === 'overdue') {
        add({ key: `maintenance:${item.id}:${today}`, title: item.name, body: item.statusText });
      }
    }
  }
  return notices;
}
