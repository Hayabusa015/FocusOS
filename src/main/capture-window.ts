import { join } from 'node:path';
import { BrowserWindow, globalShortcut, screen } from 'electron';
import { EVENTS } from '@shared/channels';

/**
 * The quick-capture window (PLAN §10): created hidden at start-up so the hotkey shows it at once,
 * a small frameless always-on-top box that closes itself on Enter, Esc, or losing focus.
 */
export function createCaptureWindow(devServerUrl: string | undefined) {
  const window = new BrowserWindow({
    width: 620,
    height: 96,
    show: false,
    frame: false,
    resizable: false,
    movable: false,
    skipTaskbar: true,
    alwaysOnTop: true,
    fullscreenable: false,
    minimizable: false,
    maximizable: false,
    title: 'Cortex capture',
    webPreferences: {
      preload: join(__dirname, '../preload/index.js'),
      contextIsolation: true,
      sandbox: true,
      nodeIntegration: false,
      webSecurity: true,
      spellcheck: false,
    },
  });
  window.webContents.on('will-navigate', (event) => event.preventDefault());
  window.webContents.setWindowOpenHandler(() => ({ action: 'deny' }));
  window.on('blur', () => window.hide());

  if (devServerUrl) void window.loadURL(`${devServerUrl}#/capture`);
  else void window.loadFile(join(__dirname, '../renderer/index.html'), { hash: '/capture' });

  const show = () => {
    if (window.isDestroyed()) return;
    const { workArea } = screen.getDisplayNearestPoint(screen.getCursorScreenPoint());
    const [w = 620, h = 96] = window.getSize();
    window.setPosition(
      Math.round(workArea.x + (workArea.width - w) / 2),
      Math.round(workArea.y + workArea.height * 0.22 - h / 2),
    );
    window.show();
    window.focus();
    window.webContents.send(EVENTS.captureShown);
  };
  const hide = () => {
    if (!window.isDestroyed()) window.hide();
  };

  let registered: string | null = null;
  /** Registers the global hotkey. Returns false when another program already owns it. */
  const setHotkey = (accelerator: string): boolean => {
    if (registered) globalShortcut.unregister(registered);
    registered = null;
    try {
      if (globalShortcut.register(accelerator, show)) {
        registered = accelerator;
        return true;
      }
    } catch {
      // Not a valid accelerator.
    }
    return false;
  };

  return {
    window,
    show,
    hide,
    setHotkey,
    destroy: () => {
      if (registered) globalShortcut.unregister(registered);
      if (!window.isDestroyed()) window.destroy();
    },
  };
}
