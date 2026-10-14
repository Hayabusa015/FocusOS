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
import { createCtx, latestUndoable, listAtlasChanges, listLog, undoEntry } from './context';
import {
  activeFocus,
  finishFocus,
  getSummary,
  getWinsView,
  logWin,
  settle,
  startFocus,
  takeAward,
} from './ledger';
import {
  briefingView,
  completeShutdown,
  markBriefingShown,
  ritualState,
  shutdownView,
} from './rituals';
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
  listChildren,
  listCarryForward,
  listDueOn,
  listSubtasks,
  listTasks,
  queryTasks,
  reopenTask,
  reorderTasks,
  rescheduleTask,
  updateTask,
} from './tasks';
import type { TaskQuery } from './tasks';
import { getToday, getUpcoming, search } from './views';
import type { DayWindow } from './views';

/**
 * The one object the rest of the app talks to for tasks, areas and maintenance. Every method that
 * changes data returns a Mutation carrying the undo log id, so the screen can offer Undo.
 */
export function createStore(db: Db, options: { clock?: () => Date; newId?: () => string } = {}) {
  const ctx: Ctx = createCtx(db, options.clock, options.newId);
  // XP, wins and achievements follow the data: settled inside every change and every undo.
  ctx.afterChange = () => settle(ctx);

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
    listChildren: (ids: string[]) => listChildren(ctx, ids),
    reorderTasks: (ids: string[]) => reorderTasks(ctx, ids),
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

    // Accomplishments (Phase 2)
    getSummary: () => getSummary(ctx),
    getWins: () => getWinsView(ctx),
    logWin: (text: string) => logWin(ctx, text),
    /** What the last changes earned, read once so the screen can celebrate. */
    takeAward: () => takeAward(ctx),
    activeFocus: () => activeFocus(ctx),
    startFocus: (input: { taskId?: string | null; plannedMinutes: number }) =>
      startFocus(ctx, input),
    finishFocus: (id: string, completed: boolean) => finishFocus(ctx, id, completed),

    // Rituals
    ritualState: (options: { briefingEnabled: boolean }) => ritualState(ctx, options),
    markBriefingShown: () => markBriefingShown(ctx),
    briefing: () => briefingView(ctx),
    shutdown: () => shutdownView(ctx),
    completeShutdown: () => completeShutdown(ctx),

    /**
     * The same changes, made by Atlas: logged under actor 'atlas' so the panel can list them and
     * offer Undo on each. Atlas can archive a task but never hard-delete (PLAN §7.3).
     */
    atlas: {
      createTask: (input: TaskCreate, source: Task['source'] = 'atlas') =>
        createTask(ctx, input, 'atlas', source),
      updateTask: (patch: TaskUpdate) => updateTask(ctx, patch, 'atlas'),
      completeTask: (id: string) => completeTask(ctx, id, 'atlas'),
      reopenTask: (id: string) => reopenTask(ctx, id, 'atlas'),
      archiveTask: (id: string) => deleteTask(ctx, id, 'atlas'),
      rescheduleTask: (id: string, dueDate: LocalDate) => rescheduleTask(ctx, id, dueDate, 'atlas'),
      markMaintenanceDone: (id: string, date?: LocalDate, note?: string) =>
        markMaintenanceDone(ctx, id, date, note, 'atlas'),
    },
    queryTasks: (q: TaskQuery) => queryTasks(ctx, q),
    listAtlasChanges: (day?: LocalDate) => listAtlasChanges(ctx, day ?? ctx.today()),

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
