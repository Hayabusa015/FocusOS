import { addDays, parseLocalDate, toLocalDate } from '@shared/dates';

/** "Today", "Tomorrow", "Fri, Oct 16" for a local YYYY-MM-DD date. */
export function friendlyDate(date: string, today: string = toLocalDate(new Date())): string {
  if (date === today) return 'Today';
  if (date === addDays(today, 1)) return 'Tomorrow';
  if (date === addDays(today, -1)) return 'Yesterday';
  const { y, m, d } = parseLocalDate(date);
  return new Date(y, m - 1, d).toLocaleDateString([], {
    weekday: 'short',
    month: 'short',
    day: 'numeric',
  });
}

/** "9:30 AM" for a local HH:MM time, in the user's clock style. */
export function friendlyTime(time: string): string {
  const [h, m] = time.split(':').map(Number);
  return new Date(2000, 0, 1, h ?? 0, m ?? 0).toLocaleTimeString([], {
    hour: 'numeric',
    minute: '2-digit',
  });
}

export function timeOfIso(iso: string): string {
  return new Date(iso).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' });
}

/** "25 min", "1 h 20 min". */
export function minutesText(minutes: number): string {
  const m = Math.max(0, Math.round(minutes));
  if (m < 60) return `${m} min`;
  const h = Math.floor(m / 60);
  return m % 60 === 0 ? `${h} h` : `${h} h ${m % 60} min`;
}
