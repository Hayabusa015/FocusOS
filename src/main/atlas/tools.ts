import { z } from 'zod';
import { betaZodTool } from '@anthropic-ai/sdk/helpers/beta/zod';
import { isoToLocalDate, isoToLocalTime } from '@shared/dates';
import type { Area, Task } from '@shared/core';
import { LocalDateSchema, TaskSize, TimeSchema } from '@shared/core';
import type { Store } from '../db/store';
import type { DayWindow } from '../db/views';

/**
 * The tools Atlas can call (PLAN §7.3). Each one is a spec with a `mutates` flag, so the rule
 * "read-only modes get no tool that changes data" is enforced by the tool list and checked by a
 * test, not just promised in a prompt. A tool never throws at the model: a problem comes back as
 * text it can read and recover from.
 *
 * Not here yet: the vault tools (Phase 6), `remember_fact` and knowledge search (Phase 7), and the
 * Google Calendar half of `create_time_block` (Phase 5). Nothing sends email or changes settings.
 */
export interface ToolContext {
  store: Store;
  window: () => DayWindow;
  /** Called with every change a tool makes, so the panel can offer Undo. */
  record: (change: { logId: string; summary: string }) => void;
}

export interface ToolSpec<S extends z.ZodType = z.ZodType> {
  name: string;
  description: string;
  schema: S;
  /** True when the tool can change data. Read-only modes may only use tools where this is false. */
  mutates: boolean;
  run: (ctx: ToolContext, input: z.infer<S>) => string;
}

const spec = <S extends z.ZodType>(s: ToolSpec<S>): ToolSpec<S> => s;

// --- Shapes the model sees ------------------------------------------------------------------

function areaName(areas: Area[], id: string | null): string | null {
  return id ? (areas.find((a) => a.id === id)?.name ?? null) : null;
}

function brief(t: Task, areas: Area[]) {
  return {
    id: t.id,
    title: t.title,
    area: areaName(areas, t.areaId),
    status: t.status,
    due: t.dueDate,
    dueTime: t.dueTime,
    size: t.size,
    block: t.scheduledStart
      ? {
          date: isoToLocalDate(t.scheduledStart),
          time: isoToLocalTime(t.scheduledStart),
          minutes: t.scheduledMinutes,
        }
      : null,
    timesPutOff: t.deferCount || undefined,
    repeats: t.recurrenceText ?? undefined,
    steps: t.subtaskCount ? `${t.subtasksDone}/${t.subtaskCount} done` : undefined,
  };
}

const json = (value: unknown): string => JSON.stringify(value);
const fail = (message: string): string => `Could not do that: ${message}`;

/** An area given by name (any case), or null for "no area". Throws a readable message if unknown. */
function resolveArea(store: Store, name: string | null | undefined): string | null {
  if (name === undefined || name === null || name.trim() === '' || /^(none|inbox)$/i.test(name))
    return null;
  const areas = store.listAreas();
  const wanted = name.trim().toLowerCase();
  const hit =
    areas.find((a) => a.name.toLowerCase() === wanted) ??
    areas.find((a) => a.name.toLowerCase().startsWith(wanted)) ??
    areas.find((a) => a.name.toLowerCase().includes(wanted));
  if (!hit)
    throw new Error(
      `There is no area called "${name}". Areas: ${areas.map((a) => a.name).join(', ')}`,
    );
  return hit.id;
}

/** Runs a tool body and turns a thrown problem into text for the model. */
function safely(fn: () => string): string {
  try {
    return fn();
  } catch (error) {
    return fail(error instanceof Error ? error.message : 'unknown problem');
  }
}

const AreaRef = z
  .string()
  .max(80)
  .describe('An area name exactly as list_areas shows it (any case). Omit for none.');
const TaskId = z.string().min(1).max(40).describe('A task id from list_tasks or create_task');

// --- The tools ------------------------------------------------------------------------------

export const TOOL_SPECS = [
  spec({
    name: 'list_areas',
    description:
      "List the user's areas (such as Chemistry or Home). Names here are the only valid areas.",
    schema: z.object({}),
    mutates: false,
    run: ({ store }) =>
      json(store.listAreas().map((a) => ({ id: a.id, name: a.name, kind: a.kind }))),
  }),

  spec({
    name: 'list_tasks',
    description:
      'List tasks, soonest due first (max 100). Finished tasks are left out unless includeDone is true. Use area "none" for tasks with no area (the inbox).',
    schema: z.object({
      area: AreaRef.optional(),
      status: z.enum(['inbox', 'todo', 'doing', 'done', 'someday']).optional(),
      dueFrom: LocalDateSchema.optional().describe('YYYY-MM-DD, inclusive'),
      dueTo: LocalDateSchema.optional().describe('YYYY-MM-DD, inclusive'),
      text: z.string().max(100).optional().describe('Words in the title or notes'),
      includeDone: z.boolean().optional(),
      limit: z.number().int().min(1).max(100).optional(),
    }),
    mutates: false,
    run: ({ store }, input) =>
      safely(() => {
        const areas = store.listAreas();
        const areaId = input.area === undefined ? undefined : resolveArea(store, input.area);
        const tasks = store.queryTasks({
          ...(areaId !== undefined ? { areaId } : {}),
          ...(input.status ? { status: input.status } : {}),
          ...(input.dueFrom ? { dueFrom: input.dueFrom } : {}),
          ...(input.dueTo ? { dueTo: input.dueTo } : {}),
          ...(input.text ? { text: input.text } : {}),
          ...(input.includeDone ? { includeDone: true } : {}),
          ...(input.limit ? { limit: input.limit } : {}),
        });
        return json({ count: tasks.length, tasks: tasks.map((t) => brief(t, areas)) });
      }),
  }),

  spec({
    name: 'create_task',
    description:
      "Add a task. Only the title is required. With an area it goes on that area's list; without one it lands in the inbox to be sorted. Never invent a due date the user did not give.",
    schema: z.object({
      title: z.string().trim().min(1).max(200),
      area: AreaRef.optional(),
      dueDate: LocalDateSchema.optional().describe('YYYY-MM-DD'),
      dueTime: TimeSchema.optional().describe('HH:MM, 24 hour'),
      size: TaskSize.optional().describe('s about 15 min, m about 45, l about 90 or more'),
      notes: z.string().max(2000).optional(),
    }),
    mutates: true,
    run: (ctx, input) =>
      safely(() => {
        const areaId = resolveArea(ctx.store, input.area);
        const made = ctx.store.atlas.createTask({
          title: input.title,
          ...(areaId ? { areaId } : {}),
          ...(input.dueDate ? { dueDate: input.dueDate } : {}),
          ...(input.dueTime ? { dueTime: input.dueTime } : {}),
          ...(input.size ? { size: input.size } : {}),
          ...(input.notes ? { notes: input.notes } : {}),
        });
        ctx.record(made);
        return json({ created: brief(made.result, ctx.store.listAreas()) });
      }),
  }),

  spec({
    name: 'update_task',
    description:
      'Change a task. Send only the fields to change. Set dueDate or dueTime to null to clear them. Use complete_task to finish a task and reschedule_task to move its date.',
    schema: z.object({
      id: TaskId,
      title: z.string().trim().min(1).max(200).optional(),
      area: AreaRef.nullable().optional().describe('null moves it back to the inbox'),
      status: z.enum(['todo', 'doing', 'someday']).optional(),
      dueDate: LocalDateSchema.nullable().optional(),
      dueTime: TimeSchema.nullable().optional(),
      size: TaskSize.optional(),
      notes: z.string().max(2000).nullable().optional(),
    }),
    mutates: true,
    run: (ctx, input) =>
      safely(() => {
        const { id, area, ...rest } = input;
        const areaId = area === undefined ? undefined : resolveArea(ctx.store, area);
        const done = ctx.store.atlas.updateTask({
          id,
          ...rest,
          ...(areaId !== undefined ? { areaId } : {}),
        });
        ctx.record(done);
        return json({ updated: brief(done.result, ctx.store.listAreas()) });
      }),
  }),

  spec({
    name: 'complete_task',
    description:
      'Mark a task finished. This awards XP and shows a celebration. A repeating task makes its next one.',
    schema: z.object({ id: TaskId }),
    mutates: true,
    run: (ctx, { id }) =>
      safely(() => {
        const done = ctx.store.atlas.completeTask(id);
        if (done.logId) ctx.record(done);
        const areas = ctx.store.listAreas();
        return json({
          completed: brief(done.result.task, areas),
          next: done.result.next ? brief(done.result.next, areas) : undefined,
        });
      }),
  }),

  spec({
    name: 'reschedule_task',
    description:
      'Move a task, and any time block it has, to another day. Counts as putting it off if the new date is later.',
    schema: z.object({ id: TaskId, dueDate: LocalDateSchema.describe('YYYY-MM-DD') }),
    mutates: true,
    run: (ctx, { id, dueDate }) =>
      safely(() => {
        const done = ctx.store.atlas.rescheduleTask(id, dueDate);
        ctx.record(done);
        return json({ rescheduled: brief(done.result, ctx.store.listAreas()) });
      }),
  }),

  spec({
    name: 'archive_task',
    description:
      'Remove a task from the lists (it can be brought back with Undo). Atlas can never permanently delete anything.',
    schema: z.object({ id: TaskId }),
    mutates: true,
    run: (ctx, { id }) =>
      safely(() => {
        const title = ctx.store.getTask(id)?.title;
        const done = ctx.store.atlas.archiveTask(id);
        ctx.record(done);
        return json({ archived: title ?? id });
      }),
  }),

  spec({
    name: 'capture_to_inbox',
    description: 'Quick dump: save text as an unsorted inbox task, with no area and no date.',
    schema: z.object({ text: z.string().trim().min(1).max(200) }),
    mutates: true,
    run: (ctx, { text }) =>
      safely(() => {
        const made = ctx.store.atlas.createTask({ title: text });
        ctx.record(made);
        return json({ captured: brief(made.result, ctx.store.listAreas()) });
      }),
  }),

  spec({
    name: 'get_today',
    description:
      'Today: the date, the day window, what is happening now and next, the time blocks, what is due, what is carried over, and the counts.',
    schema: z.object({}),
    mutates: false,
    run: ({ store, window }) => {
      const areas = store.listAreas();
      const t = store.getToday(window());
      return json({
        date: t.date,
        now: t.nowIso,
        dayWindow: {
          start: t.dayStart,
          end: t.dayEnd,
          minutesLeft: t.arc.minutesLeft,
          phase: t.arc.phase,
        },
        nowBlock: t.nowBlock?.title ?? null,
        nextBlock: t.nextBlock
          ? { title: t.nextBlock.title, startsInMinutes: t.nextBlock.startsInMinutes }
          : null,
        blocks: t.blocks.map((b) => ({
          taskId: b.taskId,
          title: b.title,
          start: isoToLocalTime(b.start),
          end: isoToLocalTime(b.end),
          status: b.status,
        })),
        dueToday: t.dueToday.map((x) => brief(x, areas)),
        carriedOver: t.carryForward.map((x) => brief(x, areas)),
        counters: t.counters,
      });
    },
  }),

  spec({
    name: 'get_upcoming',
    description: 'The next 14 days: tasks by due date, and home maintenance that is coming due.',
    schema: z.object({}),
    mutates: false,
    run: ({ store }) => {
      const areas = store.listAreas();
      const u = store.getUpcoming();
      return json({
        today: u.today,
        days: u.days.map((d) => ({
          date: d.date ?? 'later',
          tasks: d.tasks.map((x) => brief(x, areas)),
          maintenance: d.maintenance.map((m) => ({ id: m.id, name: m.name, status: m.statusText })),
        })),
      });
    },
  }),

  spec({
    name: 'create_time_block',
    description:
      "Put a task on the timeline for a day: a start time and a length. It also moves the task's due date to that day. (It is not added to Google Calendar yet.)",
    schema: z.object({
      id: TaskId,
      date: LocalDateSchema.describe('YYYY-MM-DD'),
      time: TimeSchema.describe('Start, HH:MM 24 hour'),
      minutes: z.number().int().min(5).max(720),
    }),
    mutates: true,
    run: (ctx, { id, date, time, minutes }) =>
      safely(() => {
        const done = ctx.store.atlas.updateTask({
          id,
          dueDate: date,
          block: { date, time, minutes },
        });
        ctx.record(done);
        return json({ scheduled: brief(done.result, ctx.store.listAreas()) });
      }),
  }),

  spec({
    name: 'start_focus_session',
    description: 'Start a focus timer, optionally on a task. Only one can run at a time.',
    schema: z.object({
      taskId: TaskId.optional(),
      minutes: z.number().int().min(5).max(180).default(25),
    }),
    mutates: true,
    run: ({ store }, { taskId, minutes }) =>
      safely(() => {
        const s = store.startFocus({ taskId: taskId ?? null, plannedMinutes: minutes });
        return json({ started: { task: s.taskTitle, minutes: s.plannedMinutes } });
      }),
  }),

  spec({
    name: 'log_maintenance_done',
    description:
      'Record that a home maintenance item was done. Give its id or its name (as get_upcoming shows it).',
    schema: z.object({
      item: z.string().min(1).max(100).describe('Maintenance item id or name'),
      date: LocalDateSchema.optional().describe('YYYY-MM-DD; today if omitted'),
      note: z.string().max(300).optional(),
    }),
    mutates: true,
    run: (ctx, { item, date, note }) =>
      safely(() => {
        const items = ctx.store.listMaintenance();
        const wanted = item.trim().toLowerCase();
        const hits = items.filter((m) => m.id === item || m.name.toLowerCase() === wanted);
        const found = hits.length
          ? hits
          : items.filter((m) => m.name.toLowerCase().includes(wanted));
        if (found.length === 0) throw new Error(`No maintenance item matches "${item}"`);
        if (found.length > 1)
          throw new Error(`More than one matches: ${found.map((m) => m.name).join(', ')}`);
        const done = ctx.store.atlas.markMaintenanceDone(found[0]!.id, date, note);
        ctx.record(done);
        return json({ logged: done.summary });
      }),
  }),

  spec({
    name: 'get_progress',
    description: "XP, level, the streak, and today's wins.",
    schema: z.object({}),
    mutates: false,
    run: ({ store }) => {
      const w = store.getWins();
      return json({
        totalXp: w.summary.totalXp,
        level: w.summary.level,
        xpToday: w.summary.xpToday,
        winsToday: w.todayWins.map((x) => x.text),
        streak: `${w.summary.streak.active} of the last 7 days active`,
        achievements: `${w.summary.achievementsUnlocked} of ${w.summary.achievementsTotal}`,
      });
    },
  }),
] as const;

export type ToolName = (typeof TOOL_SPECS)[number]['name'];

/** The names of tools that cannot change data: the only ones a read-only mode may be given. */
export const READ_ONLY_TOOLS: readonly ToolName[] = TOOL_SPECS.filter((t) => !t.mutates).map(
  (t) => t.name,
);

export function specsFor(names: readonly string[]): ToolSpec[] {
  const wanted = new Set(names);
  const found = TOOL_SPECS.filter((t) => wanted.has(t.name)) as unknown as ToolSpec[];
  if (found.length !== wanted.size) throw new Error('Unknown Atlas tool in a mode list');
  return found;
}

/** The SDK's runnable tools for a list of specs. Input is validated against each Zod schema. */
export function runnableTools(specs: readonly ToolSpec[], ctx: ToolContext) {
  return specs.map((s) =>
    betaZodTool({
      name: s.name,
      description: s.description,
      inputSchema: s.schema,
      run: (input: unknown) => s.run(ctx, input),
    }),
  );
}
