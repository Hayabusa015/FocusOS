import { z } from 'zod';
import { LocalDateSchema, TaskSize } from '@shared/core';
import type { SortApply, SortResult } from '@shared/atlas-modes';
import { AtlasError } from '../errors';
import type { AtlasDeps } from '../engine';
import { runMode } from './run';
import type { ModeDef } from './run';
import type { ApplyOutcome } from '@shared/atlas-modes';

/** What the model returns. The area is a NAME, checked against the real list afterwards. */
const SorterOutput = z.object({
  proposals: z.array(
    z.object({
      taskId: z.string(),
      area: z.string().nullable().describe('An area name from the list, or null if none fits'),
      dueDate: LocalDateSchema.nullable().describe(
        'Only if the item says or clearly implies a date',
      ),
      size: TaskSize.nullable(),
      reason: z.string().describe('A few words: why this area'),
    }),
  ),
});

/**
 * Sorter (PLAN §7.8): proposes an area, date and size for each inbox item. Read-only tools; it
 * returns proposals and changes nothing. The user approves the batch.
 */
export const SORTER: ModeDef<typeof SorterOutput> = {
  route: 'sorter',
  tools: ['list_areas', 'list_tasks'],
  schema: SorterOutput,
  instructions: `Mode: Sorter. You are given the user's areas and their unsorted inbox items. For every inbox item, propose the area it belongs in.
- Choose areas only from the list given. If none fits, use null. Never invent an area.
- Give a dueDate only when the item states or clearly implies one (relative to today's date). Otherwise null.
- Give a size (s about 15 minutes, m about 45, l about 90 or more) only when the item makes it clear. Otherwise null.
- Return exactly one proposal per item, using the item's id. Keep each reason to a few words.
- You change nothing. The user will review and approve.`,
};

export async function sortInbox(deps: AtlasDeps): Promise<SortResult> {
  const { store } = deps;
  const areas = store.listAreas();
  const inbox = store.listTasks({ view: 'inbox' });
  if (inbox.length === 0) return { proposals: [] };

  const today = store.ctx.today();
  const prompt = [
    `Today is ${today}.`,
    `Areas: ${areas.map((a) => a.name).join(', ')}.`,
    `Inbox items (JSON):`,
    JSON.stringify(inbox.slice(0, 100).map((t) => ({ id: t.id, title: t.title, notes: t.notes }))),
  ].join('\n');

  const out = await runMode(deps, SORTER, prompt);

  const byId = new Map(out.proposals.map((p) => [p.taskId, p]));
  const proposals = inbox.slice(0, 100).map((t): SortResult['proposals'][number] => {
    const p = byId.get(t.id);
    const wanted = p?.area?.trim().toLowerCase();
    // Only a real area survives; anything else becomes "no suggestion".
    const area = wanted ? areas.find((a) => a.name.toLowerCase() === wanted) : undefined;
    const dueDate = p?.dueDate && p.dueDate >= today ? p.dueDate : null;
    return {
      taskId: t.id,
      title: t.title,
      areaId: area?.id ?? null,
      areaName: area?.name ?? null,
      dueDate,
      size: p?.size ?? null,
      reason: p ? p.reason : 'No suggestion',
    };
  });
  return { proposals };
}

/** The user approved (some of) the proposals: now, and only now, the tasks change. */
export function applySort(deps: AtlasDeps, apply: SortApply): ApplyOutcome {
  const logIds: string[] = [];
  const failed: string[] = [];
  for (const item of apply.items) {
    try {
      const patch = {
        id: item.taskId,
        ...(item.areaId ? { areaId: item.areaId } : {}),
        ...(item.dueDate ? { dueDate: item.dueDate } : {}),
        ...(item.size ? { size: item.size } : {}),
      };
      if (Object.keys(patch).length === 1) continue;
      logIds.push(deps.store.atlas.updateTask(patch).logId);
    } catch (error) {
      failed.push(error instanceof Error ? error.message : 'A task could not be changed');
    }
  }
  if (logIds.length === 0 && failed.length > 0) throw new AtlasError(failed[0]!, 'invalid');
  return {
    logIds,
    failed,
    summary: `Atlas sorted ${logIds.length} ${logIds.length === 1 ? 'item' : 'items'}`,
  };
}
