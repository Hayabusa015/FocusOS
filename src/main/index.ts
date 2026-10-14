import { join } from 'node:path';
import { z } from 'zod';
import {
  app,
  BrowserWindow,
  dialog,
  globalShortcut,
  Menu,
  nativeImage,
  Notification,
  session,
  Tray,
} from 'electron';
import { EVENTS } from '@shared/channels';
import { toLocalDate } from '@shared/dates';
import { DEFAULT_SETTINGS } from '@shared/core';
import type { AppSettings, SettingsInfo } from '@shared/core';
import trayIconPath from '../../resources/tray.png?asset';
import { backupDatabase } from './db/backup';
import { openDatabase } from './db/connection';
import type { Db } from './db/connection';
import { runMigrations } from './db/migrate';
import { readSettings, writeSettings } from './db/app-settings';
import { ensureDailyBackup, listDailyBackups } from './db/daily-backup';
import { createStore } from './db/store';
import { SettingsStore } from './db/settings';
import { createCaptureWindow } from './capture-window';
import { createNotifier } from './notifier';
import { registerCoreIpc } from './ipc/core';
import { UpdaterController } from './domain/updater-controller';
import { buildCsp } from '@shared/csp';
import { registerIpc } from './ipc';
import { makeTrustCheck } from './ipc/trust';
import { createLogger } from './log';
import { createElectronUpdaterBackend } from './updater';
import { createFakeUpdaterBackend } from './updater-fake';
import { testHooksEnabled, updaterMode } from './test-hooks';

const APP_ID = 'org.shull.cortex';
const devServerUrl = app.isPackaged ? undefined : process.env['ELECTRON_RENDERER_URL'];

// Where everything lives (PLAN §12): %APPDATA%\Cortex. Development uses its own folder so a
// half-built version never touches the real data; tests point CORTEX_DATA_DIR at a temp folder.
app.setName('Cortex');
// The test hooks below (CORTEX_DATA_DIR, CORTEX_TEST, CORTEX_TEST_UPDATER) are read only in an
// unpackaged build, so an environment variable can never redirect or alter the installed app.
const testHooks = testHooksEnabled(app.isPackaged);
const dataDir =
  (testHooks ? process.env['CORTEX_DATA_DIR'] : undefined) ??
  (app.isPackaged ? app.getPath('userData') : `${app.getPath('userData')}-dev`);
app.setPath('userData', dataDir);
app.setAppUserModelId(APP_ID);

let mainWindow: BrowserWindow | null = null;
let quitting = false;
let tray: Tray | null = null;
let db: Db | null = null;
let updater: UpdaterController | null = null;
let capture: ReturnType<typeof createCaptureWindow> | null = null;
let keepInTray = DEFAULT_SETTINGS.keepRunningInTray;
let notifyTimer: NodeJS.Timeout | null = null;

function createWindow(): BrowserWindow {
  const window = new BrowserWindow({
    width: 1200,
    height: 800,
    minWidth: 900,
    minHeight: 600,
    show: false, // shown on ready-to-show, so there is no white flash
    title: 'Cortex',
    autoHideMenuBar: true,
    webPreferences: {
      preload: join(__dirname, '../preload/index.js'),
      contextIsolation: true,
      sandbox: true,
      nodeIntegration: false,
      webSecurity: true,
      spellcheck: false,
    },
  });
  window.once('ready-to-show', () => window.show());
  window.on('closed', () => {
    if (mainWindow === window) mainWindow = null;
    // With the tray setting off, closing the window quits (the hidden capture window would
    // otherwise keep the app alive).
    if (!keepInTray && !quitting) app.quit();
  });
  // The renderer never navigates and never opens windows.
  window.webContents.on('will-navigate', (event) => event.preventDefault());
  window.webContents.setWindowOpenHandler(() => ({ action: 'deny' }));

  if (devServerUrl) void window.loadURL(devServerUrl);
  else void window.loadFile(join(__dirname, '../renderer/index.html'));
  return window;
}

function showWindow(): void {
  if (!mainWindow || mainWindow.isDestroyed()) mainWindow = createWindow();
  if (mainWindow.isMinimized()) mainWindow.restore();
  mainWindow.show();
  mainWindow.focus();
}

function createTray(): void {
  tray = new Tray(nativeImage.createFromPath(trayIconPath));
  tray.setToolTip('Cortex');
  tray.setContextMenu(
    Menu.buildFromTemplate([
      { label: 'Open Cortex', click: showWindow },
      { type: 'separator' },
      { label: 'Quit Cortex', click: () => app.quit() },
    ]),
  );
  tray.on('click', showWindow);
}

function applySecurity(): void {
  const csp = buildCsp(Boolean(devServerUrl));
  session.defaultSession.webRequest.onHeadersReceived((details, callback) => {
    callback({
      responseHeaders: { ...details.responseHeaders, 'Content-Security-Policy': [csp] },
    });
  });
  // No camera, microphone, notifications or the like until a feature asks for one explicitly.
  session.defaultSession.setPermissionRequestHandler((_webContents, _permission, callback) =>
    callback(false),
  );
}

function broadcast(channel: string, payload: unknown): void {
  for (const window of BrowserWindow.getAllWindows()) {
    if (!window.isDestroyed()) window.webContents.send(channel, payload);
  }
}

if (!app.requestSingleInstanceLock()) {
  app.quit();
} else {
  app.on('second-instance', showWindow);

  void app.whenReady().then(() => {
    const log = createLogger(join(dataDir, 'logs'));
    log.info(`Cortex ${app.getVersion()} starting (packaged: ${app.isPackaged})`);

    try {
      db = openDatabase(join(dataDir, 'cortex.db'));
      const result = runMigrations(db, undefined, { backupDir: join(dataDir, 'backups') });
      if (result.applied.length > 0) {
        log.info(`Migrated database v${result.from} to v${result.to}`);
      }
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      log.error(`Database could not be opened: ${message}`);
      // Tests set CORTEX_TEST so a headless run can read the reason from stderr.
      if (testHooks && process.env['CORTEX_TEST']) console.error(`Cortex cannot start: ${message}`);
      else dialog.showErrorBox('Cortex cannot start', message);
      app.exit(1);
      return;
    }

    const database = db;
    const settings = new SettingsStore(database);
    const mode = updaterMode(app.isPackaged, process.env);
    const backend =
      mode === 'real'
        ? createElectronUpdaterBackend(log)
        : mode === 'fake'
          ? createFakeUpdaterBackend(dataDir, () => app.quit(), app.getVersion())
          : null;
    updater = new UpdaterController({
      backend,
      disabledReason: 'Updates are checked only in the installed app.',
      currentVersion: app.getVersion(),
      settings,
      backupBeforeInstall: (from, to) => {
        const path = backupDatabase(
          database,
          join(dataDir, 'backups', `pre-update-${from}-to-${to}.db`),
        );
        log.info(`Backed up the database to ${path}`);
      },
      onState: (state) => broadcast(EVENTS.updaterState, state),
      log: (message) => log.warn(message),
    });

    const isTrustedSender = makeTrustCheck(devServerUrl);
    const coreStore = createStore(database);
    // First run: the seven default areas (PLAN §6). Done once, so deleting one never brings it back.
    if (!settings.get('areas.seeded', z.boolean())) {
      database.exec('BEGIN');
      try {
        coreStore.seedAreas();
        settings.set('areas.seeded', true);
        database.exec('COMMIT');
      } catch (error) {
        database.exec('ROLLBACK');
        throw error;
      }
    }
    const backupsDir = join(dataDir, 'backups');
    try {
      ensureDailyBackup(database, backupsDir, toLocalDate(new Date()));
    } catch (error) {
      log.warn(`Daily backup failed: ${error instanceof Error ? error.message : String(error)}`);
    }

    const currentSettings = (): AppSettings => readSettings(settings);
    keepInTray = currentSettings().keepRunningInTray;
    capture = createCaptureWindow(devServerUrl);
    let hotkeyOk = capture.setHotkey(currentSettings().captureHotkey);
    if (!hotkeyOk) log.warn('The capture hotkey is taken by another program');
    const settingsInfo = (): SettingsInfo => {
      const { dates } = listDailyBackups(backupsDir);
      return {
        settings: currentSettings(),
        hotkeyRegistered: hotkeyOk,
        lastBackup: dates[0] ?? null,
        backupCount: dates.length,
      };
    };

    registerIpc({ updater, dataDir, isTrustedSender });
    registerCoreIpc({
      store: coreStore,
      isTrustedSender,
      notifyChanged: (change) => broadcast(EVENTS.dataChanged, change),
      getSettings: settingsInfo,
      updateSettings: (patch) => {
        const before = currentSettings();
        // Try a new shortcut first: if it is refused, nothing in this patch is saved.
        if (patch.captureHotkey && patch.captureHotkey !== before.captureHotkey) {
          if (!capture?.setHotkey(patch.captureHotkey)) {
            hotkeyOk = capture?.setHotkey(before.captureHotkey) ?? false;
            throw new Error('That shortcut is not available. Another program may be using it.');
          }
          hotkeyOk = true;
        }
        try {
          const next = writeSettings(settings, patch);
          keepInTray = next.keepRunningInTray;
        } catch (error) {
          hotkeyOk = capture?.setHotkey(before.captureHotkey) ?? false;
          throw error;
        }
        broadcast(EVENTS.dataChanged, { logId: null, summary: null });
        return settingsInfo();
      },
      getDayWindow: () => {
        const s = currentSettings();
        return { dayStart: s.dayStart, dayEnd: s.dayEnd };
      },
      hideCapture: () => capture?.hide(),
    });

    const notifier = createNotifier({
      store: coreStore,
      kv: settings,
      getSettings: currentSettings,
      show: (notice) => {
        const n = new Notification({ title: notice.title, body: notice.body });
        n.on('click', showWindow);
        n.show();
      },
    });
    notifyTimer = setInterval(() => {
      try {
        notifier.tick();
      } catch (error) {
        log.warn(`Notifications failed: ${error instanceof Error ? error.message : String(error)}`);
      }
    }, 30_000);

    applySecurity();
    createTray();
    showWindow();
    updater.start();
  });

  app.on('before-quit', () => {
    quitting = true;
    updater?.prepareForQuit();
  });
  app.on('will-quit', () => {
    if (notifyTimer) clearInterval(notifyTimer);
    globalShortcut.unregisterAll();
    capture?.destroy();
    updater?.stop();
    db?.close();
  });
  // The app stays in the tray when the window closes (the hotkey needs it running). The
  // hidden capture window means this event rarely fires; quitting is done in createWindow.
  app.on('window-all-closed', () => {
    if (!keepInTray) app.quit();
  });
}
