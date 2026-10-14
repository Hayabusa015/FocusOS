import { contextBridge, ipcRenderer } from 'electron';
import { CHANNELS, EVENTS } from '@shared/channels';
import type { CortexApi } from '@shared/api';
import type { AppInfo, UpdaterState } from '@shared/schemas';

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
};

contextBridge.exposeInMainWorld('cortex', api);
