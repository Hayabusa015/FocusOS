import { z } from 'zod';
import { LocalDateSchema, TaskSize, TimeSchema } from '@shared/core';
import type { ApplyOutcome, BrainDumpApply, BrainDumpResult } from '@shared/atlas-modes';
import type { AtlasDeps } from '../engine';
import { runMode } from './run';
import type { ModeDef } from './run';

/** The shape from PLAN §7.6. `area_guess` is a name, checked against the real list afterwards. */
const ScribeOutput = z.object({
  tasks: z.array(
    z.object({
      title: z.string().describe('A short action, starting with a verb'),
      area_guess: z.string().nullable().describe('An area name from the list, or null'),
      due_date: LocalDateSchema.nullable().describe('Only if stated or clearly implied'),
      due_time: TimeSchema.nullable(),
      size_guess: TaskSize,
      notes: z.string().nullable(),
    }),
  ),
  unparsed: z
    .array(z.string())
    .describe('Ideas, worries and anything that is not a task, kept as short quotes'),
});

/**
 * Scribe (PLAN §7.6, §7.8): turns a rambling dump into tasks. No tools at all: structured output
 * only. Nothing is saved until the user presses Add on the checklist.
 */
export const SCRIBE: ModeDef<typeof ScribeOutput> = {
  route: 'scribe',
  tools: [],
  schema: ScribeOutput,
  instructions: `Mode: Scribe. The user has dumped whatever is on their mind. Turn it into tasks.
- Each task is a short, concrete action. Split a ramble into separate tasks; merge repeats.
- area_guess must be one of the user's areas, exactly as listed, or null. Never invent an area.
- Give a due_date only if the text states or clearly implies one, worked out from today's date. Never make one up.
- Things that are not tasks (ideas, worries, remarks) go in unparsed, kept short. Do not discard them and do not turn them into tasks.
- size_guess: s about 15 minutes, m about 45, l about 90 or more.
- You save nothing. The user will review and press Add.`,
};

const MAX_TASKS = 50;

export async function brainDump(deps: AtlasDeps, text: string): Promise<BrainDumpResult> {
  const areas = deps.store.listAreas();
  const today = deps.store.ctx.today();
  const prompt = [
    `Today is ${today}.`,
    `Areas: ${areas.map((a) => a.name).join(', ')}.`,
    'The dump:',
    text,
  ].join('\n');
  const out = await runMode(deps, SCRIBE, prompt);

  const tasks = out.tasks
    .map((t) => {
      const wanted = t.area_guess?.trim().toLowerCase();
      const area = wanted ? areas.find((a) => a.name.toLowerCase() === wanted) : undefined;
      return {
        title: t.title.trim().slice(0, 200),
        areaId: area?.id ?? null,
        dueDate: t.due_date && t.due_date >= today ? t.due_date : null,
        dueTime: t.due_time,
        size: t.size_guess,
        notes: t.notes?.trim() ? t.notes.trim().slice(0, 2000) : null,
      };
    })
    .filter((t) => t.title.length > 0)
    .slice(0, MAX_TASKS);
  return { tasks, unparsed: out.unparsed.map((u) => u.trim()).filter(Boolean) };
}

/** The user pressed Add on the (possibly edited) checklist: only now are tasks created. */
export function addBrainDump(deps: AtlasDeps, apply: BrainDumpApply): ApplyOutcome {
  const logIds: string[] = [];
  const failed: string[] = [];
  for (const t of apply.tasks) {
    try {
      const made = deps.store.createTask(
        {
          title: t.title,
          ...(t.areaId ? { areaId: t.areaId } : {}),
          ...(t.dueDate ? { dueDate: t.dueDate } : {}),
          ...(t.dueTime ? { dueTime: t.dueTime } : {}),
          size: t.size,
          ...(t.notes ? { notes: t.notes } : {}),
        },
        'atlas',
      );
      logIds.push(made.logId);
    } catch (error) {
      failed.push(error instanceof Error ? error.message : 'A task could not be added');
    }
  }
  return {
    logIds,
    failed,
    summary: `Added ${logIds.length} ${logIds.length === 1 ? 'task' : 'tasks'} from your brain dump`,
  };
}
