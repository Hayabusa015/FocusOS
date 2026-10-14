import { z } from 'zod';
import { isoToLocalDate, isoToLocalTime, minutesOfDay, toLocalTime } from '@shared/dates';
import { TimeSchema } from '@shared/core';
import type { Task } from '@shared/core';
import type { ApplyOutcome, PlanApply, PlanResult } from '@shared/atlas-modes';
import { SIZE_MINUTES, enforcePlan } from '../../domain/planner';
import type { Span } from '../../domain/planner';
import { dayWindowOf } from '../engine';
import type { AtlasDeps } from '../engine';
import { AtlasError } from '../errors';
import { runMode } from './run';
import type { ModeDef } from './run';

const PlannerOutput = z.object({
  blocks: z.array(
    z.object({
      taskId: z.string(),
      time: TimeSchema.describe('Start, HH:MM 24 hour'),
      minutes: z.number().int().describe('Length in minutes'),
    }),
  ),
  note: z.string().describe('One or two sentences: the thinking behind the plan'),
});

/**
 * Planner (PLAN §7.8): fits tasks into the free time left today. Read-only tools; it proposes a
 * schedule and changes nothing. Whatever the model says, `enforcePlan` keeps the result inside the
 * day window, off anything already scheduled, and with at least 20% of the free time left open.
 */
export const PLANNER: ModeDef<typeof PlannerOutput> = {
  route: 'planner',
  tools: ['get_today', 'list_tasks', 'get_upcoming'],
  schema: PlannerOutput,
  instructions: `Mode: Planner. Propose a schedule for the rest of today.
- You are given the time now, the day window, the time blocks already scheduled, and candidate tasks with a suggested length.
- Choose tasks that matter most: due today first, then what has been put off, then what is quick and unblocks others. Do not try to fit everything.
- Give each chosen task a start time and a length in minutes. Never start before now, never run past the end of the day, and never overlap an existing block.
- Leave real gaps. Plan well under the available time (no more than about 70% of it) so the day has room to breathe.
- Prefer one hard thing early, with a lighter task after it.
- You change nothing. The user will accept all, some or none.`,
};

const defaultMinutes = (t: Task) => SIZE_MINUTES[t.size];

export async function planRestOfToday(deps: AtlasDeps): Promise<PlanResult> {
  const { store } = deps;
  const ctx = store.ctx;
  const window = dayWindowOf(deps.settings());
  const today = ctx.today();
  const view = store.getToday(window);
  const nowTime = toLocalTime(ctx.now());

  const blocks = view.blocks.filter((b) => b.status !== 'done');
  const busy: Span[] = blocks.map((b) => ({
    start: minutesOfDay(isoToLocalTime(b.start)),
    end: minutesOfDay(isoToLocalTime(b.end)),
  }));

  // Candidates: due today or earlier, then open undated "to do" tasks. Nothing already blocked.
  const blocked = new Set(view.blocks.map((b) => b.taskId));
  const seen = new Set<string>();
  const candidates: Task[] = [];
  for (const t of [
    ...store.queryTasks({ dueTo: today, limit: 40 }),
    ...store.queryTasks({ status: 'todo', limit: 40 }).filter((t) => !t.dueDate),
  ]) {
    if (blocked.has(t.id) || seen.has(t.id) || t.status === 'someday') continue;
    if (t.scheduledStart && isoToLocalDate(t.scheduledStart) === today) continue;
    seen.add(t.id);
    candidates.push(t);
    if (candidates.length >= 40) break;
  }

  const areas = store.listAreas();
  const prompt = [
    `Today is ${today}. It is ${nowTime}. The day window is ${window.dayStart} to ${window.dayEnd}.`,
    `Already scheduled today (do not overlap): ${JSON.stringify(
      blocks.map((b) => ({
        title: b.title,
        start: isoToLocalTime(b.start),
        end: isoToLocalTime(b.end),
      })),
    )}`,
    `Candidate tasks (JSON, with suggested minutes):`,
    JSON.stringify(
      candidates.map((t) => ({
        id: t.id,
        title: t.title,
        area: areas.find((a) => a.id === t.areaId)?.name ?? null,
        due: t.dueDate,
        size: t.size,
        suggestedMinutes: defaultMinutes(t),
        timesPutOff: t.deferCount,
      })),
    ),
  ].join('\n');

  const out = await runMode(deps, PLANNER, prompt);

  const known = new Map(candidates.map((t) => [t.id, t]));
  const proposed = out.blocks.filter((b) => known.has(b.taskId));
  const result = enforcePlan({
    nowMinute: minutesOfDay(nowTime),
    dayStart: window.dayStart,
    dayEnd: window.dayEnd,
    busy,
    proposed: proposed.map((b) => ({ taskId: b.taskId, time: b.time, minutes: b.minutes })),
  });
  const title = (id: string) => known.get(id)?.title ?? 'A task';
  return {
    date: today,
    blocks: result.accepted.map((b) => ({ ...b, title: title(b.taskId) })),
    dropped: [
      ...result.dropped.map((d) => ({ ...d, title: title(d.taskId) })),
      ...out.blocks
        .filter((b) => !known.has(b.taskId))
        .map((b) => ({
          taskId: b.taskId,
          title: 'An unknown task',
          reason: 'Atlas named a task that is not on the list',
        })),
    ],
    note: out.note,
    freeMinutes: result.freeMinutes,
    plannedMinutes: result.plannedMinutes,
  };
}

/** The user accepted (some of) the plan: now the tasks get their time blocks. */
export function applyPlan(deps: AtlasDeps, apply: PlanApply): ApplyOutcome {
  const ctx = deps.store.ctx;
  const today = ctx.today();
  const window = dayWindowOf(deps.settings());
  // The rules are checked again here, not only when the plan was proposed: time may have passed,
  // other blocks may have been added, and the payload comes from the screen.
  const replanning = new Set(apply.blocks.map((b) => b.taskId));
  const busy: Span[] = deps.store
    .getToday(window)
    .blocks.filter((b) => b.status !== 'done' && !replanning.has(b.taskId))
    .map((b) => ({
      start: minutesOfDay(isoToLocalTime(b.start)),
      end: minutesOfDay(isoToLocalTime(b.end)),
    }));
  const checked = enforcePlan({
    nowMinute: minutesOfDay(toLocalTime(ctx.now())),
    dayStart: window.dayStart,
    dayEnd: window.dayEnd,
    busy,
    proposed: apply.blocks,
  });
  const logIds: string[] = [];
  const failed: string[] = checked.dropped.map((d) => d.reason);
  for (const b of checked.accepted) {
    try {
      logIds.push(
        deps.store.atlas.updateTask({
          id: b.taskId,
          block: { date: today, time: b.time, minutes: b.minutes },
        }).logId,
      );
    } catch (error) {
      failed.push(error instanceof Error ? error.message : 'A block could not be set');
    }
  }
  if (logIds.length === 0 && failed.length > 0) throw new AtlasError(failed[0]!, 'invalid');
  return {
    logIds,
    failed,
    summary: `Atlas scheduled ${logIds.length} ${logIds.length === 1 ? 'block' : 'blocks'} today`,
  };
}
