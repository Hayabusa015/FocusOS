/**
 * Calendar dates and times of day, as the plan stores them (PLAN §6):
 *  - a date is a local `YYYY-MM-DD` string, a time of day is a local `HH:MM` string;
 *  - a moment (`created_at`, `scheduled_start`) is a UTC ISO-8601 string.
 *
 * Date arithmetic is done on calendar days in UTC, never by adding 24-hour blocks to a local
 * `Date`, so a daylight-saving change can never move a date by a day.
 */
export type LocalDate = string;

const DATE = /^(\d{4})-(\d{2})-(\d{2})$/;
const TIME = /^([01]\d|2[0-3]):([0-5]\d)$/;
const pad = (n: number, width = 2) => String(n).padStart(width, '0');

export function isValidLocalDate(value: string): boolean {
  const m = DATE.exec(value);
  if (!m) return false;
  const [y, mo, d] = [Number(m[1]), Number(m[2]), Number(m[3])];
  const check = new Date(Date.UTC(y, mo - 1, d));
  return check.getUTCFullYear() === y && check.getUTCMonth() === mo - 1 && check.getUTCDate() === d;
}

export function isValidTime(value: string): boolean {
  return TIME.test(value);
}

export function parseLocalDate(value: LocalDate): { y: number; m: number; d: number } {
  if (!isValidLocalDate(value)) throw new Error(`Not a valid date: "${value}"`);
  const m = DATE.exec(value) as RegExpExecArray;
  return { y: Number(m[1]), m: Number(m[2]), d: Number(m[3]) };
}

/** Today's (or any moment's) date in the machine's timezone. */
export function toLocalDate(moment: Date): LocalDate {
  return `${pad(moment.getFullYear(), 4)}-${pad(moment.getMonth() + 1)}-${pad(moment.getDate())}`;
}

export function toLocalTime(moment: Date): string {
  return `${pad(moment.getHours())}:${pad(moment.getMinutes())}`;
}

export function addDays(value: LocalDate, days: number): LocalDate {
  const { y, m, d } = parseLocalDate(value);
  const shifted = new Date(Date.UTC(y, m - 1, d + days));
  return `${pad(shifted.getUTCFullYear(), 4)}-${pad(shifted.getUTCMonth() + 1)}-${pad(shifted.getUTCDate())}`;
}

/** Whole calendar days from `from` to `to` (negative when `to` is earlier). */
export function daysBetween(from: LocalDate, to: LocalDate): number {
  const a = parseLocalDate(from);
  const b = parseLocalDate(to);
  return Math.round((Date.UTC(b.y, b.m - 1, b.d) - Date.UTC(a.y, a.m - 1, a.d)) / 86_400_000);
}

/** 0 = Sunday ... 6 = Saturday. */
export function weekdayOf(value: LocalDate): number {
  const { y, m, d } = parseLocalDate(value);
  return new Date(Date.UTC(y, m - 1, d)).getUTCDay();
}

export function daysInMonth(year: number, month: number): number {
  return new Date(Date.UTC(year, month, 0)).getUTCDate();
}

/** The Monday of the week containing `value`. Weeks run Monday to Sunday. */
export function startOfWeek(value: LocalDate): LocalDate {
  const back = (weekdayOf(value) + 6) % 7;
  return addDays(value, -back);
}

/** A local date and time of day as a UTC instant, e.g. for a time block's start. */
export function localToIso(date: LocalDate, time: string): string {
  const { y, m, d } = parseLocalDate(date);
  const match = TIME.exec(time);
  if (!match) throw new Error(`Not a valid time: "${time}"`);
  return new Date(y, m - 1, d, Number(match[1]), Number(match[2])).toISOString();
}

export function isoToLocalDate(iso: string): LocalDate {
  return toLocalDate(new Date(iso));
}

export function isoToLocalTime(iso: string): string {
  return toLocalTime(new Date(iso));
}

export function minutesOfDay(time: string): number {
  const match = TIME.exec(time);
  if (!match) throw new Error(`Not a valid time: "${time}"`);
  return Number(match[1]) * 60 + Number(match[2]);
}

export const WEEKDAY_NAMES = [
  'Sunday',
  'Monday',
  'Tuesday',
  'Wednesday',
  'Thursday',
  'Friday',
  'Saturday',
];
export const WEEKDAY_SHORT = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
