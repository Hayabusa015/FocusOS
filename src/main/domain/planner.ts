import { minutesOfDay } from '@shared/dates';

/**
 * The rules the Planner's proposal must obey (PLAN §7.8), enforced in code rather than trusted to a
 * prompt: it never plans past the end of the day window, never plans over something already
 * scheduled, and always leaves at least 20% of the free time unplanned.
 */
export const SLACK_FRACTION = 0.2;
/** Default lengths until real durations are learned (PLAN §7.8). */
export const SIZE_MINUTES = { s: 15, m: 45, l: 90 } as const;
const SNAP = 5;

export interface Span {
  start: number;
  end: number;
}
export interface ProposedBlock {
  taskId: string;
  /** HH:MM */
  time: string;
  minutes: number;
}
export interface Dropped {
  taskId: string;
  reason: string;
}
export interface PlanResult {
  accepted: ProposedBlock[];
  dropped: Dropped[];
  /** Minutes between now (or the day start) and the day end, minus what is already scheduled. */
  freeMinutes: number;
  plannedMinutes: number;
  /** The most that may be planned: free time less the 20% kept back. */
  planLimitMinutes: number;
}

export const toTime = (minutes: number): string =>
  `${String(Math.floor(minutes / 60)).padStart(2, '0')}:${String(minutes % 60).padStart(2, '0')}`;

const overlaps = (a: Span, b: Span) => a.start < b.end && b.start < a.end;
const ceilTo = (n: number) => Math.ceil(n / SNAP) * SNAP;

/** Merges spans and clips them to a window, so free time can be counted without double counting. */
function clippedUnion(spans: Span[], from: number, to: number): Span[] {
  const sorted = spans
    .map((s) => ({ start: Math.max(s.start, from), end: Math.min(s.end, to) }))
    .filter((s) => s.end > s.start)
    .sort((a, b) => a.start - b.start);
  const out: Span[] = [];
  for (const s of sorted) {
    const last = out[out.length - 1];
    if (last && s.start <= last.end) last.end = Math.max(last.end, s.end);
    else out.push({ ...s });
  }
  return out;
}

export interface PlanInput {
  /** Minutes since midnight, now. */
  nowMinute: number;
  dayStart: string;
  dayEnd: string;
  /** Time blocks and calendar events already on the day. */
  busy: Span[];
  proposed: ProposedBlock[];
}

export function enforcePlan(input: PlanInput): PlanResult {
  const dayEnd = minutesOfDay(input.dayEnd);
  const from = Math.max(minutesOfDay(input.dayStart), ceilTo(input.nowMinute));
  const busy = clippedUnion(input.busy, from, dayEnd);
  const freeMinutes = Math.max(
    dayEnd - from - busy.reduce((sum, s) => sum + (s.end - s.start), 0),
    0,
  );
  const planLimitMinutes = Math.floor(freeMinutes * (1 - SLACK_FRACTION));

  const accepted: ProposedBlock[] = [];
  const dropped: Dropped[] = [];
  const taken: Span[] = [...busy];
  let planned = 0;
  const seen = new Set<string>();

  const ordered = [...input.proposed]
    .map((p, order) => ({ p, order }))
    .sort((a, b) => minutesOfDay(a.p.time) - minutesOfDay(b.p.time) || a.order - b.order);

  for (const { p } of ordered) {
    const drop = (reason: string) => dropped.push({ taskId: p.taskId, reason });
    if (seen.has(p.taskId)) {
      drop('Already planned once');
      continue;
    }
    const start = Math.round(minutesOfDay(p.time) / SNAP) * SNAP;
    const minutes = Math.max(Math.round(p.minutes / SNAP) * SNAP, SNAP);
    const span = { start, end: start + minutes };
    if (span.start < from) drop('That time has already passed');
    else if (span.end > dayEnd) drop('It would run past the end of the day');
    else if (taken.some((t) => overlaps(t, span))) drop('It overlaps something already scheduled');
    else if (planned + minutes > planLimitMinutes)
      drop('That would leave less than 20% of the free time open');
    else {
      accepted.push({ taskId: p.taskId, time: toTime(start), minutes });
      taken.push(span);
      planned += minutes;
      seen.add(p.taskId);
    }
  }
  accepted.sort((a, b) => minutesOfDay(a.time) - minutesOfDay(b.time));
  return { accepted, dropped, freeMinutes, plannedMinutes: planned, planLimitMinutes };
}
