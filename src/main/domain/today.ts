import { minutesOfDay } from '@shared/dates';

/** The Now/Next bar and the day-window arc (PLAN §10). Pure: the caller supplies the clock. */

export interface TimedBlock {
  taskId: string;
  title: string;
  areaId: string | null;
  status: string;
  /** Milliseconds since the epoch. */
  startMs: number;
  endMs: number;
}

export interface NowNext<B extends TimedBlock> {
  now: (B & { minutesLeft: number }) | null;
  next: (B & { startsInMinutes: number }) | null;
}

const minutes = (ms: number) => Math.max(0, Math.round(ms / 60_000));

/**
 * "Now" is the block running at `nowMs`, and "Next" is the first block that starts after it.
 * Finished tasks and blocks never show: a done block is behind you, not ahead.
 */
export function nowNext<B extends TimedBlock>(blocks: B[], nowMs: number): NowNext<B> {
  const open = blocks.filter((b) => b.status !== 'done').sort((a, b) => a.startMs - b.startMs);
  const current = open.find((b) => b.startMs <= nowMs && nowMs < b.endMs);
  const upcoming = open.find((b) => b.startMs > nowMs);
  return {
    now: current ? { ...current, minutesLeft: minutes(current.endMs - nowMs) } : null,
    next: upcoming ? { ...upcoming, startsInMinutes: minutes(upcoming.startMs - nowMs) } : null,
  };
}

export interface DayArc {
  phase: 'before' | 'during' | 'after';
  /** How much of the day window has passed, 0 to 1. */
  fraction: number;
  minutesLeft: number;
}

export function dayArc(dayStart: string, dayEnd: string, now: Date): DayArc {
  const start = minutesOfDay(dayStart);
  const end = minutesOfDay(dayEnd);
  const current = now.getHours() * 60 + now.getMinutes();
  if (end <= start) throw new Error('The day must end after it starts');
  if (current < start) return { phase: 'before', fraction: 0, minutesLeft: end - start };
  if (current >= end) return { phase: 'after', fraction: 1, minutesLeft: 0 };
  return {
    phase: 'during',
    fraction: (current - start) / (end - start),
    minutesLeft: end - current,
  };
}

/** "1h 10m", "45m", "7h". */
export function formatDuration(totalMinutes: number): string {
  const m = Math.max(0, Math.round(totalMinutes));
  const h = Math.floor(m / 60);
  const rest = m % 60;
  if (h === 0) return `${rest}m`;
  return rest === 0 ? `${h}h` : `${h}h ${rest}m`;
}
