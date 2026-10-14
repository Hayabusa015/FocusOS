import { contextBridge, ipcRenderer } from 'electron';
import { CHANNELS, EVENTS } from '@shared/channels';
import type { CortexApi } from '@shared/api';
import type { AppInfo, UpdaterState } from '@shared/schemas';

const call = <T>(channel: string, payload?: unknown) =>
  ipcRenderer.invoke(channel, payload) as Promise<T>;

function subscribe<T>(event: string, listener: (payload: T) => void): () => void {
  const handler = (_event: Electron.IpcRendererEvent, payload: T) => listener(payload);
  ipcRenderer.on(event, handler);
  return () => ipcRenderer.removeListener(event, handler);
}

const api: CortexApi = {
  app: {
    info: () => ipcRenderer.invoke(CHANNELS.appInfo) as Promise<AppInfo>,
  },
  updater: {
    getState: () => ipcRenderer.invoke(CHANNELS.updaterGetState) as Promise<UpdaterState>,
    check: () => ipcRenderer.invoke(CHANNELS.updaterCheck) as Promise<UpdaterState>,
    download: () => ipcRenderer.invoke(CHANNELS.updaterDownload) as Promise<UpdaterState>,
    install: () => ipcRenderer.invoke(CHANNELS.updaterInstall) as Promise<UpdaterState>,
    snooze: (version) =>
      ipcRenderer.invoke(CHANNELS.updaterSnooze, { version }) as Promise<UpdaterState>,
    dismissUpdated: () =>
      ipcRenderer.invoke(CHANNELS.updaterDismissUpdated) as Promise<UpdaterState>,
    onState: (listener) => {
      const handler = (_event: Electron.IpcRendererEvent, state: UpdaterState) => listener(state);
      ipcRenderer.on(EVENTS.updaterState, handler);
      return () => ipcRenderer.removeListener(EVENTS.updaterState, handler);
    },
  },
  areas: {
    list: (includeArchived) => call(CHANNELS.areasList, { includeArchived }),
    create: (input) => call(CHANNELS.areasCreate, input),
    update: (input) => call(CHANNELS.areasUpdate, input),
  },
  tasks: {
    list: (filter) => call(CHANNELS.tasksList, filter),
    get: (id) => call(CHANNELS.tasksGet, { id }),
    create: (input) => call(CHANNELS.tasksCreate, input),
    update: (patch) => call(CHANNELS.tasksUpdate, patch),
    complete: (id) => call(CHANNELS.tasksComplete, { id }),
    reopen: (id) => call(CHANNELS.tasksReopen, { id }),
    delete: (id) => call(CHANNELS.tasksDelete, { id }),
    reschedule: (id, dueDate) => call(CHANNELS.tasksReschedule, { id, dueDate }),
  },
  capture: {
    submit: (text) => call(CHANNELS.captureSubmit, { text }),
    hide: () => call(CHANNELS.captureHide),
    onShown: (listener) => subscribe(EVENTS.captureShown, () => listener()),
  },
  maintenance: {
    list: () => call(CHANNELS.maintenanceList),
    templates: () => call(CHANNELS.maintenanceTemplates),
    create: (input) => call(CHANNELS.maintenanceCreate, input),
    update: (patch) => call(CHANNELS.maintenanceUpdate, patch),
    done: (id, date, note) => call(CHANNELS.maintenanceDone, { id, date, note }),
    delete: (id) => call(CHANNELS.maintenanceDelete, { id }),
  },
  today: { get: () => call(CHANNELS.todayGet) },
  upcoming: { get: () => call(CHANNELS.upcomingGet) },
  search: { run: (query) => call(CHANNELS.searchRun, { query }) },
  undo: {
    list: () => call(CHANNELS.undoList),
    apply: (id) => call(CHANNELS.undoApply, { id }),
  },
  settings: {
    get: () => call(CHANNELS.settingsGet),
    update: (patch) => call(CHANNELS.settingsUpdate, patch),
  },
  onDataChanged: (listener) => subscribe(EVENTS.dataChanged, listener),
};

contextBridge.exposeInMainWorld('cortex', api);
