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
  tasksReorder: 'tasks:reorder',
  tasksChildren: 'tasks:children',

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

  summaryGet: 'summary:get',
  winsGet: 'wins:get',
  winsLog: 'wins:log',

  focusActive: 'focus:active',
  focusStart: 'focus:start',
  focusFinish: 'focus:finish',

  ritualsState: 'rituals:state',
  ritualsBriefing: 'rituals:briefing',
  ritualsBriefingShown: 'rituals:briefing-shown',
  ritualsShutdown: 'rituals:shutdown',
  ritualsShutdownComplete: 'rituals:shutdown-complete',

  atlasStatus: 'atlas:status',
  atlasSetKey: 'atlas:set-key',
  atlasClearKey: 'atlas:clear-key',
  atlasHistory: 'atlas:history',
  atlasSend: 'atlas:send',
  atlasChanges: 'atlas:changes',
  atlasSort: 'atlas:sort',
  atlasSortApply: 'atlas:sort-apply',
  atlasPlan: 'atlas:plan',
  atlasPlanApply: 'atlas:plan-apply',
  atlasDump: 'atlas:dump',
  atlasDumpApply: 'atlas:dump-apply',

  voiceStatus: 'voice:status',
  voiceSpeak: 'voice:speak',
  voicePreview: 'voice:preview',
  voiceTranscribe: 'voice:transcribe',
  voicePrerender: 'voice:prerender',

  googleStatus: 'google:status',
  googleConnect: 'google:connect',
  googleReconnect: 'google:reconnect',
  googleDisconnect: 'google:disconnect',
  googleCalendars: 'google:calendars',
  googleSync: 'google:sync',
  googleEmailCheck: 'google:email-check',
  googleEmailList: 'google:email-list',
  googleEmailAccept: 'google:email-accept',
  googleEmailDismiss: 'google:email-dismiss',

  settingsGet: 'settings:get',
  settingsUpdate: 'settings:update',
} as const;

/** Main → renderer push channels. */
export const EVENTS = {
  updaterState: 'updater:state',
  dataChanged: 'data:changed',
  /** Sent to the capture window each time it is shown, so it clears and focuses its box. */
  captureShown: 'capture:shown',
  /** The shutdown reminder was clicked: open the ritual. */
  openShutdown: 'ritual:open-shutdown',
  /** A piece of Atlas's reply as it streams in. */
  atlasChunk: 'atlas:chunk',
  /** The voice hotkey was pressed: start or stop recording. */
  voiceToggle: 'voice:toggle',
} as const;

export type ChannelName = (typeof CHANNELS)[keyof typeof CHANNELS];
export type EventName = (typeof EVENTS)[keyof typeof EVENTS];
