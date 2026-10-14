import { writeFileSync } from 'node:fs';
import { join } from 'node:path';
import type { UpdaterBackend } from './domain/updater-controller';

/**
 * A pretend release feed for end-to-end tests: a newer version (one patch ahead of the running app) with hostile release
 * notes, a download that reports progress, and an install that only leaves a marker file.
 * Used only when CORTEX_TEST_UPDATER=fake in an UNPACKAGED build (see index.ts); a packaged
 * Cortex can never reach this.
 */
/** The version the fake feed offers: always one patch ahead of the running app. */
export function nextPatchVersion(current: string): string {
  const m = /^(\d+)\.(\d+)\.(\d+)$/.exec(current);
  if (!m) throw new Error(`Cannot bump version "${current}"`);
  return `${m[1]}.${m[2]}.${Number(m[3]) + 1}`;
}

export function fakeReleaseNotes(version: string): string {
  return [
    `## ${version}`,
    '',
    '- A **harmless** change',
    '- See [the notes](https://example.com)',
    '',
    '<script>window.__notesScriptRan = true</script>',
    '<img src="https://example.com/x.png" onerror="window.__notesScriptRan = true">',
  ].join('\n');
}

export function createFakeUpdaterBackend(
  dataDir: string,
  quit: () => void,
  currentVersion: string,
): UpdaterBackend {
  const next = nextPatchVersion(currentVersion);
  const pause = (ms: number) => new Promise((done) => setTimeout(done, ms));
  return {
    check: async () => ({ version: next, releaseNotes: fakeReleaseNotes(next) }),
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
