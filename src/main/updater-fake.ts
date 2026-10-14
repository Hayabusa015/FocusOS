import { writeFileSync } from 'node:fs';
import { join } from 'node:path';
import type { UpdaterBackend } from './domain/updater-controller';

/**
 * A pretend release feed for end-to-end tests: a newer version "0.0.2" with hostile release
 * notes, a download that reports progress, and an install that only leaves a marker file.
 * Used only when CORTEX_TEST_UPDATER=fake in an UNPACKAGED build (see index.ts); a packaged
 * Cortex can never reach this.
 */
export const FAKE_RELEASE_NOTES = [
  '## 0.0.2',
  '',
  '- A **harmless** change',
  '- See [the notes](https://example.com)',
  '',
  '<script>window.__notesScriptRan = true</script>',
  '<img src="https://example.com/x.png" onerror="window.__notesScriptRan = true">',
].join('\n');

export function createFakeUpdaterBackend(dataDir: string, quit: () => void): UpdaterBackend {
  const pause = (ms: number) => new Promise((done) => setTimeout(done, ms));
  return {
    check: async () => ({ version: '0.0.2', releaseNotes: FAKE_RELEASE_NOTES }),
    download: async (onProgress) => {
      for (const percent of [25, 60, 100]) {
        await pause(60);
        onProgress(percent);
      }
    },
    quitAndInstall: () => {
      writeFileSync(join(dataDir, 'fake-install-called'), 'yes');
      quit();
    },
  };
}
