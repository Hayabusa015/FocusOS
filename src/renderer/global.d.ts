import type { CortexApi } from '@shared/api';

declare global {
  interface Window {
    /** Provided by the preload script. The renderer's only way to reach the app. */
    cortex: CortexApi;
  }
}

export {};
