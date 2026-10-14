import type { AppInfo, UpdaterState } from './schemas';

/** The only thing the renderer can call. Implemented in the preload script. */
export interface CortexApi {
  app: {
    info(): Promise<AppInfo>;
  };
  updater: {
    getState(): Promise<UpdaterState>;
    check(): Promise<UpdaterState>;
    download(): Promise<UpdaterState>;
    install(): Promise<UpdaterState>;
    snooze(version: string): Promise<UpdaterState>;
    dismissUpdated(): Promise<UpdaterState>;
    /** Subscribe to state changes. Returns an unsubscribe function. */
    onState(listener: (state: UpdaterState) => void): () => void;
  };
}
