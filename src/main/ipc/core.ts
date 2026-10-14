import { z } from 'zod';
import { CHANNELS } from '@shared/channels';
import {
  AreaCreate,
  AreaUpdate,
  AppSettingsPatch,
  CaptureSubmit,
  MaintenanceCreate,
  MaintenanceDone,
  MaintenanceUpdate,
  SearchQuery,
  TaskCreate,
  TaskFilter,
  TaskChildrenRequest,
  TaskId,
  TaskReorder,
  TaskReschedule,
  TaskUpdate,
  UndoApply,
} from '@shared/core';
import type { DataChanged, SettingsInfo } from '@shared/core';
import { EmptyRequest as Empty } from '@shared/schemas';
import { MAINTENANCE_TEMPLATES } from '../domain/maintenance';
import type { Store } from '../db/store';
import { handle } from './handle';
import type { TrustCheck } from './handle';

export interface CoreIpcDeps {
  store: Store;
  isTrustedSender: TrustCheck;
  /** Tells every window that data changed, with the undo entry to offer. */
  notifyChanged(change: DataChanged): void;
  getSettings(): SettingsInfo;
  updateSettings(patch: AppSettingsPatch): SettingsInfo;
  getDayWindow(): { dayStart: string; dayEnd: string };
  hideCapture(): void;
}

/** Registers the Phase 1 channels. Every payload is validated before the handler sees it. */
export function registerCoreIpc(deps: CoreIpcDeps): void {
  const { store, isTrustedSender: trust } = deps;

  /** Runs a change, then tells the windows. A change that did nothing sends nothing. */
  const changed = <T>(m: { result: T; logId: string | null; summary: string | null }): T => {
    if (m.logId) deps.notifyChanged({ logId: m.logId, summary: m.summary });
    return m.result;
  };

  handle(
    CHANNELS.areasList,
    z.object({ includeArchived: z.boolean().optional() }).optional(),
    (p) => store.listAreas(p?.includeArchived ?? false),
    trust,
  );
  handle(CHANNELS.areasCreate, AreaCreate, (p) => changed(store.createArea(p)), trust);
  handle(CHANNELS.areasUpdate, AreaUpdate, (p) => changed(store.updateArea(p)), trust);

  handle(CHANNELS.tasksList, TaskFilter, (p) => store.listTasks(p), trust);
  handle(
    CHANNELS.tasksGet,
    TaskId,
    ({ id }) => {
      const task = store.getTask(id);
      return task ? { task, subtasks: store.listSubtasks(id) } : null;
    },
    trust,
  );
  handle(CHANNELS.tasksCreate, TaskCreate, (p) => changed(store.createTask(p)), trust);
  handle(CHANNELS.tasksUpdate, TaskUpdate, (p) => changed(store.updateTask(p)), trust);
  handle(CHANNELS.tasksComplete, TaskId, ({ id }) => changed(store.completeTask(id)), trust);
  handle(CHANNELS.tasksReopen, TaskId, ({ id }) => changed(store.reopenTask(id)), trust);
  handle(CHANNELS.tasksDelete, TaskId, ({ id }) => changed(store.deleteTask(id)), trust);
  handle(
    CHANNELS.tasksReschedule,
    TaskReschedule,
    ({ id, dueDate }) => changed(store.rescheduleTask(id, dueDate)),
    trust,
  );

  handle(CHANNELS.tasksReorder, TaskReorder, ({ ids }) => changed(store.reorderTasks(ids)), trust);
  handle(CHANNELS.tasksChildren, TaskChildrenRequest, ({ ids }) => store.listChildren(ids), trust);

  handle(CHANNELS.captureSubmit, CaptureSubmit, ({ text }) => changed(store.capture(text)), trust);
  handle(CHANNELS.captureHide, Empty, () => deps.hideCapture(), trust);

  handle(CHANNELS.maintenanceList, Empty, () => store.listMaintenance(), trust);
  handle(CHANNELS.maintenanceTemplates, Empty, () => MAINTENANCE_TEMPLATES, trust);
  handle(
    CHANNELS.maintenanceCreate,
    MaintenanceCreate,
    (p) => changed(store.createMaintenance(p)),
    trust,
  );
  handle(
    CHANNELS.maintenanceUpdate,
    MaintenanceUpdate,
    (p) => changed(store.updateMaintenance(p)),
    trust,
  );
  handle(
    CHANNELS.maintenanceDone,
    MaintenanceDone,
    ({ id, date, note }) => changed(store.markMaintenanceDone(id, date, note)),
    trust,
  );
  handle(
    CHANNELS.maintenanceDelete,
    TaskId,
    ({ id }) => changed(store.deleteMaintenance(id)),
    trust,
  );

  handle(CHANNELS.todayGet, Empty, () => store.getToday(deps.getDayWindow()), trust);
  handle(CHANNELS.upcomingGet, Empty, () => store.getUpcoming(), trust);
  handle(CHANNELS.searchRun, SearchQuery, ({ query }) => store.search(query), trust);

  handle(CHANNELS.undoList, Empty, () => store.listLog(10), trust);
  handle(
    CHANNELS.undoApply,
    UndoApply,
    ({ id }) => {
      const undone = store.undo(id);
      if (undone) deps.notifyChanged({ logId: null, summary: `Undid: ${undone.summary}` });
      return undone;
    },
    trust,
  );

  handle(CHANNELS.settingsGet, Empty, () => deps.getSettings(), trust);
  handle(CHANNELS.settingsUpdate, AppSettingsPatch, (p) => deps.updateSettings(p), trust);
}
