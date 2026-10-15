import { minutesOfDay } from './dates';

/** True when `time` falls in the quiet window, which may run past midnight (21:30 to 06:30). */
export function inQuietHours(time: string, quiet: { start: string; end: string }): boolean {
  const t = minutesOfDay(time);
  const start = minutesOfDay(quiet.start);
  const end = minutesOfDay(quiet.end);
  if (start === end) return false;
  return start < end ? t >= start && t < end : t >= start || t < end;
}
