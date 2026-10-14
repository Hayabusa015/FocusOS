import { addDays, isValidLocalDate, weekdayOf } from '@shared/dates';
import type { LocalDate } from '@shared/dates';

/**
 * Quick-capture shorthand (PLAN §10), parsed locally with no AI:
 *   #chem            the area whose name starts with "chem"
 *   !today !tomorrow !fri !2026-10-16 !10/16   the due date
 *
 * Only a token that really means something is consumed. Anything else (an unknown #tag, a stray
 * "!") stays in the title, so nothing the user typed is silently thrown away.
 */
export interface CaptureArea {
  id: string;
  name: string;
}

export interface CaptureResult {
  title: string;
  areaId: string | null;
  dueDate: LocalDate | null;
}

const WEEKDAYS: Record<string, number> = {
  sun: 0,
  sunday: 0,
  mon: 1,
  monday: 1,
  tue: 2,
  tues: 2,
  tuesday: 2,
  wed: 3,
  weds: 3,
  wednesday: 3,
  thu: 4,
  thur: 4,
  thurs: 4,
  thursday: 4,
  fri: 5,
  friday: 5,
  sat: 6,
  saturday: 6,
};

const normalize = (text: string) => text.toLowerCase().replace(/[^a-z0-9]/g, '');

function matchArea(prefix: string, areas: CaptureArea[]): CaptureArea | null {
  const wanted = normalize(prefix);
  if (!wanted) return null;
  // Areas arrive in their display order, so an ambiguous prefix picks the first one.
  return areas.find((a) => normalize(a.name).startsWith(wanted)) ?? null;
}

/** A weekday name means the next such day strictly after today ("!fri" on a Friday is next Friday). */
function nextWeekday(target: number, today: LocalDate): LocalDate {
  const ahead = ((target - weekdayOf(today) + 6) % 7) + 1;
  return addDays(today, ahead);
}

function parseDate(word: string, today: LocalDate): LocalDate | null {
  const w = word.toLowerCase();
  if (w === 'today') return today;
  if (w === 'tomorrow' || w === 'tmrw') return addDays(today, 1);
  if (w in WEEKDAYS) return nextWeekday(WEEKDAYS[w] as number, today);
  if (isValidLocalDate(word)) return word;
  const md = /^(\d{1,2})\/(\d{1,2})$/.exec(word);
  if (md) {
    const year = Number(today.slice(0, 4));
    for (const y of [year, year + 1]) {
      const candidate = `${y}-${md[1]?.padStart(2, '0')}-${md[2]?.padStart(2, '0')}`;
      if (isValidLocalDate(candidate) && candidate >= today) return candidate;
    }
  }
  return null;
}

export function parseCapture(
  input: string,
  areas: CaptureArea[],
  today: LocalDate,
): CaptureResult | null {
  let areaId: string | null = null;
  let dueDate: LocalDate | null = null;
  const kept: string[] = [];

  for (const token of input.split(/\s+/).filter(Boolean)) {
    if (token.startsWith('#') && areaId === null) {
      const area = matchArea(token.slice(1), areas);
      if (area) {
        areaId = area.id;
        continue;
      }
    }
    if (token.startsWith('!') && dueDate === null) {
      const date = parseDate(token.slice(1), today);
      if (date) {
        dueDate = date;
        continue;
      }
    }
    kept.push(token);
  }

  const title = kept.join(' ').trim();
  return title ? { title, areaId, dueDate } : null;
}
