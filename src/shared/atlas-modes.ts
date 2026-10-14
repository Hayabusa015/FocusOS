import { z } from 'zod';
import { LocalDateSchema, TaskSize, TimeSchema } from './core';

/**
 * What the Atlas modes hand to the screen (PLAN §7.8) and what the screen hands back when the
 * user presses the button. Proposals change nothing: only the `*Apply` messages do.
 */
const Id = z.string().min(1).max(40);

// --- Sorter ---------------------------------------------------------------------------------

export const SortProposal = z.object({
  taskId: Id,
  title: z.string(),
  /** Null when Atlas had no good area for it. */
  areaId: Id.nullable(),
  areaName: z.string().nullable(),
  dueDate: LocalDateSchema.nullable(),
  size: TaskSize.nullable(),
  reason: z.string(),
});
export type SortProposal = z.infer<typeof SortProposal>;
export const SortResult = z.object({ proposals: z.array(SortProposal) });
export type SortResult = z.infer<typeof SortResult>;

export const SortApply = z.object({
  items: z
    .array(
      z.object({
        taskId: Id,
        areaId: Id.nullable(),
        dueDate: LocalDateSchema.nullable(),
        size: TaskSize.nullable(),
      }),
    )
    .max(200),
});
export type SortApply = z.infer<typeof SortApply>;

// --- Planner --------------------------------------------------------------------------------

export const PlanBlock = z.object({
  taskId: Id,
  title: z.string(),
  time: TimeSchema,
  minutes: z.number().int().min(5).max(720),
});
export type PlanBlock = z.infer<typeof PlanBlock>;
export const PlanResult = z.object({
  date: LocalDateSchema,
  blocks: z.array(PlanBlock),
  dropped: z.array(z.object({ taskId: Id, title: z.string(), reason: z.string() })),
  note: z.string(),
  freeMinutes: z.number().int(),
  plannedMinutes: z.number().int(),
});
export type PlanResult = z.infer<typeof PlanResult>;

export const PlanApply = z.object({
  blocks: z
    .array(z.object({ taskId: Id, time: TimeSchema, minutes: z.number().int().min(5).max(720) }))
    .max(100),
});
export type PlanApply = z.infer<typeof PlanApply>;

// --- Scribe (brain dump) ---------------------------------------------------------------------

export const DraftTask = z.object({
  title: z.string().trim().min(1).max(200),
  areaId: Id.nullable(),
  dueDate: LocalDateSchema.nullable(),
  dueTime: TimeSchema.nullable(),
  size: TaskSize,
  notes: z.string().max(2000).nullable(),
});
export type DraftTask = z.infer<typeof DraftTask>;
export const BrainDumpInput = z.object({ text: z.string().trim().min(1).max(20_000) });
export const BrainDumpResult = z.object({
  tasks: z.array(DraftTask),
  unparsed: z.array(z.string()),
});
export type BrainDumpResult = z.infer<typeof BrainDumpResult>;
export const BrainDumpApply = z.object({ tasks: z.array(DraftTask).max(100) });
export type BrainDumpApply = z.infer<typeof BrainDumpApply>;

/** What an apply call reports: the log ids (for Undo) and a sentence for the toast. */
export const ApplyOutcome = z.object({
  logIds: z.array(z.string()),
  summary: z.string(),
  failed: z.array(z.string()),
});
export type ApplyOutcome = z.infer<typeof ApplyOutcome>;
