import type { LocalDate } from '@shared/dates';
import { addDays } from '@shared/dates';

/**
 * The XP rules (PLAN §10). Pure, so every number is testable. The points themselves are stored
 * as events (db/ledger.ts); the total is always the sum of those events.
 */
export const TASK_XP = { s: 10, m: 20, l: 40 } as const;
export const MAINTENANCE_XP = 15;
export const INBOX_ZERO_XP = 10;
export const SHUTDOWN_XP = 10;
export const FROG_AFTER_DEFERRALS = 2;
export const MINUTES_PER_FOCUS_XP = 5;
/** A day counts as active with at least this many wins. */
export const ACTIVE_DAY_WINS = 3;

export type TaskSize = keyof typeof TASK_XP;

/** A task pushed to a later day twice or more is a "frog": finally finishing it earns 50% more. */
export const isFrog = (deferCount: number): boolean => deferCount >= FROG_AFTER_DEFERRALS;

export function taskXp(size: TaskSize, deferCount: number): number {
  const base = TASK_XP[size];
  return isFrog(deferCount) ? base + Math.round(base / 2) : base;
}

/** One point for each full five minutes of a completed focus session. */
export const focusXp = (minutes: number): number =>
  Math.max(0, Math.floor(minutes / MINUTES_PER_FOCUS_XP));

/** Total XP needed to reach level n: 50 × n × (n + 1). */
export const xpForLevel = (n: number): number => 50 * n * (n + 1);

export interface LevelInfo {
  /** 0 until the first 100 XP. */
  level: number;
  xpIntoLevel: number;
  xpForNext: number;
  /** 0 to 1 toward the next level. */
  progress: number;
}

export function levelFor(totalXp: number): LevelInfo {
  const xp = Math.max(0, Math.floor(totalXp));
  let level = 0;
  while (xpForLevel(level + 1) <= xp) level++;
  const floor = level === 0 ? 0 : xpForLevel(level);
  const span = xpForLevel(level + 1) - floor;
  const into = xp - floor;
  return { level, xpIntoLevel: into, xpForNext: span, progress: span === 0 ? 0 : into / span };
}

export interface StreakDay {
  date: LocalDate;
  wins: number;
  active: boolean;
}

/**
 * "Active days in the last 7", today included. A day is active with three or more wins. It is
 * a count out of seven, so one missed day costs one, never the whole streak.
 */
export function streakWindow(winsByDate: ReadonlyMap<string, number>, today: LocalDate) {
  const days: StreakDay[] = [];
  for (let i = 6; i >= 0; i--) {
    const date = addDays(today, -i);
    const wins = winsByDate.get(date) ?? 0;
    days.push({ date, wins, active: wins >= ACTIVE_DAY_WINS });
  }
  return { days, active: days.filter((d) => d.active).length, of: 7 as const };
}
