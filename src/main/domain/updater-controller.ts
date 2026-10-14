import { z } from 'zod';
import type { UpdaterState } from '@shared/schemas';

/**
 * The update state machine (PLAN §11B). It knows nothing about Electron or the database:
 * the real updater, the settings store, the clock and the "is the user busy" signal are all
 * handed in, which is what lets the tests drive a whole release cycle with fakes.
 */

export interface UpdateInfoLike {
  version: string;
  releaseNotes?: string | { version: string; note: string | null }[] | null;
}

export interface UpdaterBackend {
  /** Resolves the update's info when a newer release exists, or null when up to date. */
  check(): Promise<UpdateInfoLike | null>;
  download(onProgress: (percent: number) => void): Promise<void>;
  quitAndInstall(): void;
}

export interface KeyValue {
  get<S extends z.ZodType>(key: string, schema: S): z.infer<S> | undefined;
  set(key: string, value: unknown): void;
  delete(key: string): void;
}

export interface UpdaterDeps {
  /** Null when updates are off (development builds). */
  backend: UpdaterBackend | null;
  disabledReason?: string;
  currentVersion: string;
  settings: KeyValue;
  now?: () => Date;
  /** Copies the database to `backups/pre-update-<from>-to-<to>.db`. */
  backupBeforeInstall: (from: string, to: string) => void;
  onState: (state: UpdaterState) => void;
  log?: (message: string) => void;
}

export const FIRST_CHECK_DELAY_MS = 30_000;
export const CHECK_INTERVAL_MS = 4 * 60 * 60 * 1000;
export const SNOOZE_MS = 24 * 60 * 60 * 1000;

const KEYS = {
  lastChecked: 'updater.lastCheckedAt',
  snooze: 'updater.snooze',
  pendingNotes: 'updater.pendingNotes',
  lastRunVersion: 'app.lastRunVersion',
  justUpdated: 'updater.justUpdated',
} as const;

const SnoozeRecord = z.object({ version: z.string(), until: z.string() });
const NotesRecord = z.object({ version: z.string(), notes: z.string().nullable() });
const JustUpdatedRecord = z.object({ version: z.string(), releaseNotes: z.string().nullable() });

export function normalizeReleaseNotes(notes: UpdateInfoLike['releaseNotes']): string | null {
  if (!notes) return null;
  if (typeof notes === 'string') return notes.trim() || null;
  const text = notes
    .filter((n) => n.note)
    .map((n) => `## ${n.version}\n\n${n.note}`)
    .join('\n\n');
  return text || null;
}

function shortError(error: unknown): string {
  const message = error instanceof Error ? error.message : String(error);
  return message.split('\n')[0]?.slice(0, 200) || 'Unknown error';
}

export class UpdaterController {
  private state: UpdaterState;
  private readonly now: () => Date;
  private readonly log: (message: string) => void;
  private readonly busyReasons = new Set<string>();
  private firstCheckTimer: ReturnType<typeof setTimeout> | null = null;
  private interval: ReturnType<typeof setInterval> | null = null;
  private inFlight = false;

  constructor(private readonly deps: UpdaterDeps) {
    this.now = deps.now ?? (() => new Date());
    this.log = deps.log ?? (() => undefined);
    this.state = {
      status: deps.backend ? 'idle' : 'disabled',
      currentVersion: deps.currentVersion,
      latestVersion: null,
      releaseNotes: null,
      progressPercent: null,
      lastCheckedAt: deps.settings.get(KEYS.lastChecked, z.string()) ?? null,
      snoozedUntil: null,
      busy: false,
      error: null,
      disabledReason: deps.backend
        ? null
        : (deps.disabledReason ?? 'Updates are checked only in the installed app.'),
      justUpdated: null,
    };
  }

  getState(): UpdaterState {
    return this.withDerived(this.state);
  }

  /** Records the version change from the last run, then schedules the checks. */
  start(): void {
    this.recordVersionChange();
    if (!this.deps.backend) {
      this.emit();
      return;
    }
    this.firstCheckTimer = setTimeout(() => void this.check(false), FIRST_CHECK_DELAY_MS);
    this.interval = setInterval(() => void this.check(false), CHECK_INTERVAL_MS);
    this.emit();
  }

  stop(): void {
    if (this.firstCheckTimer) clearTimeout(this.firstCheckTimer);
    if (this.interval) clearInterval(this.interval);
    this.firstCheckTimer = this.interval = null;
  }

  /** `manual` checks (the Settings button) bring a snoozed update back. */
  async check(manual: boolean): Promise<UpdaterState> {
    const { backend } = this.deps;
    if (!backend) return this.getState();
    // Never check over the top of a download, or once an update is ready to install.
    if (
      this.inFlight ||
      this.state.status === 'downloading' ||
      this.state.status === 'downloaded'
    ) {
      return this.getState();
    }
    this.inFlight = true;
    this.patch({ status: 'checking', error: null });
    try {
      const info = await backend.check();
      const checkedAt = this.now().toISOString();
      this.deps.settings.set(KEYS.lastChecked, checkedAt);
      if (info && info.version !== this.deps.currentVersion) {
        if (manual) this.deps.settings.delete(KEYS.snooze);
        this.patch({
          status: 'available',
          latestVersion: info.version,
          releaseNotes: normalizeReleaseNotes(info.releaseNotes),
          lastCheckedAt: checkedAt,
          progressPercent: null,
        });
      } else {
        this.patch({
          status: 'up-to-date',
          latestVersion: this.deps.currentVersion,
          releaseNotes: null,
          lastCheckedAt: checkedAt,
        });
      }
    } catch (error) {
      this.log(`Update check failed: ${shortError(error)}`);
      this.patch({ status: 'error', error: shortError(error) });
    } finally {
      this.inFlight = false;
    }
    return this.getState();
  }

  async download(): Promise<UpdaterState> {
    const { backend } = this.deps;
    if (!backend || this.state.status !== 'available' || !this.state.latestVersion) {
      return this.getState();
    }
    const target = this.state.latestVersion;
    this.patch({ status: 'downloading', progressPercent: 0, error: null });
    try {
      await backend.download((percent) =>
        this.patch({ progressPercent: Math.max(0, Math.min(100, Math.round(percent))) }),
      );
      this.deps.settings.set(KEYS.pendingNotes, {
        version: target,
        notes: this.state.releaseNotes,
      });
      this.deps.backupBeforeInstall(this.deps.currentVersion, target);
      this.patch({ status: 'downloaded', progressPercent: 100 });
    } catch (error) {
      this.log(`Update download failed: ${shortError(error)}`);
      this.patch({ status: 'available', progressPercent: null, error: shortError(error) });
    }
    return this.getState();
  }

  /** "Restart to install". Refuses while the user is busy; the UI shows why. */
  install(): UpdaterState {
    const { backend } = this.deps;
    if (!backend || this.state.status !== 'downloaded' || !this.state.latestVersion) {
      return this.getState();
    }
    if (this.busyReasons.size > 0) return this.getState();
    this.deps.backupBeforeInstall(this.deps.currentVersion, this.state.latestVersion);
    backend.quitAndInstall();
    return this.getState();
  }

  /**
   * Called as the app quits. When an update is downloaded, electron-updater installs it on
   * quit, so the safety copy of the database is taken here too.
   */
  prepareForQuit(): void {
    if (this.state.status === 'downloaded' && this.state.latestVersion) {
      this.deps.backupBeforeInstall(this.deps.currentVersion, this.state.latestVersion);
    }
  }

  snooze(version: string): UpdaterState {
    const until = new Date(this.now().getTime() + SNOOZE_MS).toISOString();
    this.deps.settings.set(KEYS.snooze, { version, until });
    this.emit();
    return this.getState();
  }

  dismissUpdated(): UpdaterState {
    this.deps.settings.delete(KEYS.justUpdated);
    this.state = { ...this.state, justUpdated: null };
    this.emit();
    return this.getState();
  }

  /** A focus session, ritual or recording calls this so a restart never interrupts it. */
  setBusy(reason: string, busy: boolean): void {
    const before = this.busyReasons.size > 0;
    if (busy) this.busyReasons.add(reason);
    else this.busyReasons.delete(reason);
    if (before !== this.busyReasons.size > 0) this.emit();
  }

  private recordVersionChange(): void {
    const { settings, currentVersion } = this.deps;
    const lastRun = settings.get(KEYS.lastRunVersion, z.string());
    if (lastRun !== undefined && lastRun !== currentVersion) {
      const pending = settings.get(KEYS.pendingNotes, NotesRecord);
      settings.set(KEYS.justUpdated, {
        version: currentVersion,
        releaseNotes: pending?.version === currentVersion ? pending.notes : null,
      });
      settings.delete(KEYS.pendingNotes);
    }
    settings.set(KEYS.lastRunVersion, currentVersion);
    this.state = {
      ...this.state,
      justUpdated: settings.get(KEYS.justUpdated, JustUpdatedRecord) ?? null,
    };
  }

  private patch(changes: Partial<UpdaterState>): void {
    this.state = { ...this.state, ...changes };
    this.emit();
  }

  private emit(): void {
    this.deps.onState(this.getState());
  }

  private withDerived(state: UpdaterState): UpdaterState {
    const snooze = this.deps.settings.get(KEYS.snooze, SnoozeRecord);
    const snoozed =
      snooze &&
      snooze.version === state.latestVersion &&
      Date.parse(snooze.until) > this.now().getTime();
    return {
      ...state,
      busy: this.busyReasons.size > 0,
      snoozedUntil: snoozed ? snooze.until : null,
    };
  }
}
