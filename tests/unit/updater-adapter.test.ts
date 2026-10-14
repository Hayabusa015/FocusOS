import { beforeEach, describe, expect, it, vi } from 'vitest';

const autoUpdater = vi.hoisted(() => ({
  checkForUpdates: vi.fn(),
  downloadUpdate: vi.fn(),
  quitAndInstall: vi.fn(),
  on: vi.fn(),
  removeListener: vi.fn(),
  autoDownload: true,
  autoInstallOnAppQuit: false,
  allowDowngrade: true,
  allowPrerelease: true,
  logger: null as unknown,
}));
vi.mock('electron-updater', () => ({ autoUpdater }));

const { createElectronUpdaterBackend } = await import('../../src/main/updater');
const quietLog = { info: vi.fn(), warn: vi.fn(), error: vi.fn() };

beforeEach(() => vi.clearAllMocks());

describe('createElectronUpdaterBackend', () => {
  it('configures electron-updater the way PLAN §11B asks', () => {
    createElectronUpdaterBackend(quietLog);
    expect(autoUpdater.autoDownload).toBe(false);
    expect(autoUpdater.autoInstallOnAppQuit).toBe(true);
    expect(autoUpdater.allowDowngrade).toBe(false);
    expect(autoUpdater.allowPrerelease).toBe(false);
  });

  it('returns the update info only when an update is available', async () => {
    const backend = createElectronUpdaterBackend(quietLog);
    autoUpdater.checkForUpdates.mockResolvedValueOnce({
      isUpdateAvailable: true,
      updateInfo: { version: '0.0.2' },
    });
    await expect(backend.check()).resolves.toEqual({ version: '0.0.2' });
    autoUpdater.checkForUpdates.mockResolvedValueOnce({
      isUpdateAvailable: false,
      updateInfo: { version: '0.0.1' },
    });
    await expect(backend.check()).resolves.toBeNull();
  });

  it('treats "the updater did not run" as an error, never as up to date', async () => {
    const backend = createElectronUpdaterBackend(quietLog);
    autoUpdater.checkForUpdates.mockResolvedValueOnce(null);
    await expect(backend.check()).rejects.toThrow(/not available for this install/);
  });

  it('reports download progress and always detaches its listener', async () => {
    const backend = createElectronUpdaterBackend(quietLog);
    const percents: number[] = [];
    autoUpdater.on.mockImplementation(
      (_event: string, listener: (p: { percent: number }) => void) => {
        listener({ percent: 42 });
      },
    );
    autoUpdater.downloadUpdate.mockRejectedValueOnce(new Error('boom'));
    await expect(backend.download((p) => percents.push(p))).rejects.toThrow('boom');
    expect(percents).toEqual([42]);
    expect(autoUpdater.removeListener).toHaveBeenCalledTimes(1);
  });

  it('installs silently and relaunches', () => {
    createElectronUpdaterBackend(quietLog).quitAndInstall();
    expect(autoUpdater.quitAndInstall).toHaveBeenCalledWith(true, true);
  });
});
