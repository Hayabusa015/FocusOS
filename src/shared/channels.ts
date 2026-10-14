/**
 * Every IPC channel name, in one place.
 *
 * This file imports nothing, so the sandboxed preload script can bundle it safely.
 * The request and response shapes for each channel live in `schemas.ts`.
 */
export const CHANNELS = {
  appInfo: 'app:info',
  updaterGetState: 'updater:get-state',
  updaterCheck: 'updater:check',
  updaterDownload: 'updater:download',
  updaterInstall: 'updater:install',
  updaterSnooze: 'updater:snooze',
  updaterDismissUpdated: 'updater:dismiss-updated',

  areasList: 'areas:list',
  areasCreate: 'areas:create',
  areasUpdate: 'areas:update',

  tasksList: 'tasks:list',
  tasksGet: 'tasks:get',
  tasksCreate: 'tasks:create',
  tasksUpdate: 'tasks:update',
  tasksComplete: 'tasks:complete',
  tasksReopen: 'tasks:reopen',
  tasksDelete: 'tasks:delete',
  tasksReschedule: 'tasks:reschedule',

  captureSubmit: 'capture:submit',
  captureHide: 'capture:hide',

  maintenanceList: 'maintenance:list',
  maintenanceTemplates: 'maintenance:templates',
  maintenanceCreate: 'maintenance:create',
  maintenanceUpdate: 'maintenance:update',
  maintenanceDone: 'maintenance:done',
  maintenanceDelete: 'maintenance:delete',

  todayGet: 'today:get',
  upcomingGet: 'upcoming:get',
  searchRun: 'search:run',

  undoList: 'undo:list',
  undoApply: 'undo:apply',

  settingsGet: 'settings:get',
  settingsUpdate: 'settings:update',
} as const;

/** Main → renderer push channels. */
export const EVENTS = {
  updaterState: 'updater:state',
  dataChanged: 'data:changed',
  /** Sent to the capture window each time it is shown, so it clears and focuses its box. */
  captureShown: 'capture:shown',
} as const;

export type ChannelName = (typeof CHANNELS)[keyof typeof CHANNELS];
export type EventName = (typeof EVENTS)[keyof typeof EVENTS];
