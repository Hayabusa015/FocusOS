import { autoUpdater } from 'electron-updater';
import type { Logger } from './log';
import type { UpdateInfoLike, UpdaterBackend } from './domain/updater-controller';

/**
 * The real update backend: electron-updater reading GitHub Releases (PLAN §11B).
 * Everything with decisions in it lives in the controller; this file only translates.
 */
export function createElectronUpdaterBackend(log: Logger): UpdaterBackend {
  autoUpdater.autoDownload = false; // the user chooses "Update now"
  autoUpdater.autoInstallOnAppQuit = true; // an ignored restart prompt installs at the next quit
  autoUpdater.allowDowngrade = false;
  autoUpdater.allowPrerelease = false;
  autoUpdater.logger = {
    info: (m: unknown) => log.info(`updater: ${String(m)}`),
    warn: (m: unknown) => log.warn(`updater: ${String(m)}`),
    error: (m: unknown) => log.error(`updater: ${String(m)}`),
    debug: () => undefined,
  };

  return {
    async check(): Promise<UpdateInfoLike | null> {
      const result = await autoUpdater.checkForUpdates();
      // electron-updater answers null when it did not check at all (for example an unsupported
      // install type). That must never read as "you're up to date".
      if (!result) throw new Error('Updates are not available for this install of Cortex.');
      return result.isUpdateAvailable ? result.updateInfo : null;
    },
    async download(onProgress) {
      const listener = (progress: { percent: number }) => onProgress(progress.percent);
      autoUpdater.on('download-progress', listener);
      try {
        await autoUpdater.downloadUpdate();
      } finally {
        autoUpdater.removeListener('download-progress', listener);
      }
    },
    quitAndInstall() {
      // Silent install, then start Cortex again.
      autoUpdater.quitAndInstall(true, true);
    },
  };
}
