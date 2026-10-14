import type { LocalDate } from '@shared/dates';
import type {
  AreaCreate,
  AreaUpdate,
  CaptureResult,
  MaintenanceCreate,
  MaintenanceUpdate,
  Task,
  TaskCreate,
  TaskFilter,
  TaskUpdate,
} from '@shared/core';
import { parseCapture } from '../domain/capture';
import { createArea, listAreas, seedAreas, updateArea } from './areas';
import { createCtx, latestUndoable, listLog, undoEntry } from './context';
import type { Ctx, Mutation } from './context';
import type { Db } from './connection';
import {
  createMaintenance,
  deleteMaintenance,
  getMaintenance,
  listMaintenance,
  markMaintenanceDone,
  updateMaintenance,
} from './maintenance';
import {
  completeTask,
  createTask,
  deleteTask,
  getTask,
  listBlocksOn,
  listCarryForward,
  listDueOn,
  listSubtasks,
  listTasks,
  reopenTask,
  rescheduleTask,
  updateTask,
} from './tasks';
import { getToday, getUpcoming, search } from './views';
import type { DayWindow } from './views';

/**
 * The one object the rest of the app talks to for tasks, areas and maintenance. Every method that
 * changes data returns a Mutation carrying the undo log id, so the screen can offer Undo.
 */
export function createStore(db: Db, options: { clock?: () => Date; newId?: () => string } = {}) {
  const ctx: Ctx = createCtx(db, options.clock, options.newId);

  return {
    ctx,

    // Areas
    listAreas: (includeArchived = false) => listAreas(ctx, includeArchived),
    seedAreas: () => seedAreas(ctx),
    createArea: (input: AreaCreate) => createArea(ctx, input),
    updateArea: (input: AreaUpdate) => updateArea(ctx, input),

    // Tasks
    getTask: (id: string) => getTask(ctx, id),
    listSubtasks: (id: string) => listSubtasks(ctx, id),
    listTasks: (filter: TaskFilter) => listTasks(ctx, filter),
    listDueOn: (date: LocalDate) => listDueOn(ctx, date),
    listCarryForward: () => listCarryForward(ctx, ctx.today()),
    /** Tasks that can trigger a notification today: due today, or with a block today. */
    listForNotices: (): Task[] => {
      const today = ctx.today();
      const seen = new Map<string, Task>();
      for (const t of [...listDueOn(ctx, today), ...listBlocksOn(ctx, today)]) seen.set(t.id, t);
      return [...seen.values()];
    },
    createTask: (input: TaskCreate, source?: Task['source']) =>
      createTask(ctx, input, 'user', source),
    updateTask: (patch: TaskUpdate) => updateTask(ctx, patch),
    completeTask: (id: string) => completeTask(ctx, id),
    reopenTask: (id: string) => reopenTask(ctx, id),
    deleteTask: (id: string) => deleteTask(ctx, id),
    rescheduleTask: (id: string, dueDate: LocalDate) => rescheduleTask(ctx, id, dueDate),

    /** Quick capture: parses #area and !date, then saves. Nothing to save returns a null task. */
    capture(
      text: string,
    ): Mutation<CaptureResult> | { result: CaptureResult; logId: null; summary: null } {
      const parsed = parseCapture(
        text,
        listAreas(ctx).map((a) => ({ id: a.id, name: a.name })),
        ctx.today(),
      );
      if (!parsed) return { result: { task: null }, logId: null, summary: null };
      const made = createTask(ctx, {
        title: parsed.title,
        areaId: parsed.areaId,
        dueDate: parsed.dueDate,
      });
      return { ...made, result: { task: made.result } };
    },

    // Maintenance
    listMaintenance: () => listMaintenance(ctx),
    getMaintenance: (id: string) => getMaintenance(ctx, id),
    createMaintenance: (input: MaintenanceCreate) => createMaintenance(ctx, input),
    updateMaintenance: (patch: MaintenanceUpdate) => updateMaintenance(ctx, patch),
    markMaintenanceDone: (id: string, date?: LocalDate, note?: string) =>
      markMaintenanceDone(ctx, id, date, note),
    deleteMaintenance: (id: string) => deleteMaintenance(ctx, id),

    // Views
    getToday: (window: DayWindow) => getToday(ctx, window),
    getUpcoming: () => getUpcoming(ctx),
    search: (query: string) => search(ctx, query),

    // Undo
    undo: (id: string) => undoEntry(ctx, id),
    undoLatest: () => {
      const latest = latestUndoable(ctx);
      return latest ? { id: latest.id, ...undoEntry(ctx, latest.id) } : null;
    },
    listLog: (limit?: number) => listLog(ctx, limit),
  };
}

export type Store = ReturnType<typeof createStore>;
