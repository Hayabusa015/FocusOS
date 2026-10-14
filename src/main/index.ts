import { join } from 'node:path';
import { app, BrowserWindow, dialog, Menu, nativeImage, session, Tray } from 'electron';
import { EVENTS } from '@shared/channels';
import trayIconPath from '../../resources/tray.png?asset';
import { backupDatabase } from './db/backup';
import { openDatabase } from './db/connection';
import type { Db } from './db/connection';
import { runMigrations } from './db/migrate';
import { SettingsStore } from './db/settings';
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
let tray: Tray | null = null;
let db: Db | null = null;
let updater: UpdaterController | null = null;

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
          ? createFakeUpdaterBackend(dataDir, () => app.quit())
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

    registerIpc({ updater, dataDir, isTrustedSender: makeTrustCheck(devServerUrl) });
    applySecurity();
    createTray();
    showWindow();
    updater.start();
  });

  app.on('before-quit', () => updater?.prepareForQuit());
  app.on('will-quit', () => {
    updater?.stop();
    db?.close();
  });
  app.on('window-all-closed', () => app.quit());
}
