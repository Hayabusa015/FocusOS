import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  CHECK_INTERVAL_MS,
  FIRST_CHECK_DELAY_MS,
  normalizeReleaseNotes,
  SNOOZE_MS,
  UpdaterController,
} from '../../src/main/domain/updater-controller';
import type { UpdaterBackend, UpdateInfoLike } from '../../src/main/domain/updater-controller';
import { openDatabase } from '../../src/main/db/connection';
import { runMigrations } from '../../src/main/db/migrate';
import { SettingsStore } from '../../src/main/db/settings';
import type { UpdaterState } from '../../src/shared/schemas';

let clock = new Date('2026-10-14T12:00:00Z');
const now = () => clock;

function setup(opts: { backend?: boolean; version?: string } = {}) {
  const db = openDatabase(':memory:');
  runMigrations(db);
  const settings = new SettingsStore(db, now);
  const calls = { check: 0, download: 0, install: 0 };
  let next: UpdateInfoLike | null = null;
  let checkError: Error | null = null;
  let downloadError: Error | null = null;
  const backend: UpdaterBackend = {
    check: async () => {
      calls.check++;
      if (checkError) throw checkError;
      return next;
    },
    download: async (onProgress) => {
      calls.download++;
      onProgress(40);
      if (downloadError) throw downloadError;
      onProgress(100);
    },
    quitAndInstall: () => {
      calls.install++;
    },
  };
  const backups: [string, string][] = [];
  const states: UpdaterState[] = [];
  const make = (version = opts.version ?? '0.0.1') =>
    new UpdaterController({
      backend: opts.backend === false ? null : backend,
      currentVersion: version,
      settings,
      now,
      backupBeforeInstall: (from, to) => backups.push([from, to]),
      onState: (s) => states.push(s),
    });
  return {
    controller: make(),
    make,
    settings,
    calls,
    backups,
    states,
    release: (info: UpdateInfoLike | null) => (next = info),
    failCheck: (e: Error | null) => (checkError = e),
    failDownload: (e: Error | null) => (downloadError = e),
  };
}

beforeEach(() => {
  clock = new Date('2026-10-14T12:00:00Z');
  vi.useFakeTimers({ toFake: ['setTimeout', 'setInterval', 'clearTimeout', 'clearInterval'] });
});
afterEach(() => vi.useRealTimers());

describe('development builds', () => {
  it('are disabled and never check', async () => {
    const t = setup({ backend: false });
    t.controller.start();
    await vi.advanceTimersByTimeAsync(CHECK_INTERVAL_MS * 2);
    expect(t.calls.check).toBe(0);
    expect(t.controller.getState()).toMatchObject({ status: 'disabled' });
    expect(t.controller.getState().disabledReason).toMatch(/installed app/);
    expect((await t.controller.check(true)).status).toBe('disabled');
  });
});

describe('scheduling', () => {
  it('checks 30 seconds after launch and then every 4 hours', async () => {
    const t = setup();
    t.controller.start();
    await vi.advanceTimersByTimeAsync(FIRST_CHECK_DELAY_MS - 1);
    expect(t.calls.check).toBe(0);
    await vi.advanceTimersByTimeAsync(1);
    expect(t.calls.check).toBe(1);
    await vi.advanceTimersByTimeAsync(CHECK_INTERVAL_MS - FIRST_CHECK_DELAY_MS);
    expect(t.calls.check).toBe(2);
    await vi.advanceTimersByTimeAsync(CHECK_INTERVAL_MS);
    expect(t.calls.check).toBe(3);
    t.controller.stop();
  });
});

describe('finding an update', () => {
  it('reports available with notes, and up-to-date otherwise', async () => {
    const t = setup();
    t.release({ version: '0.0.2', releaseNotes: '## 0.0.2\n- A harmless change' });
    const s = await t.controller.check(false);
    expect(s).toMatchObject({ status: 'available', latestVersion: '0.0.2' });
    expect(s.releaseNotes).toContain('A harmless change');
    expect(s.lastCheckedAt).toBe(clock.toISOString());

    const u = setup();
    u.release(null);
    expect(await u.controller.check(false)).toMatchObject({ status: 'up-to-date' });
  });

  it('treats an update with the current version as up to date', async () => {
    const t = setup();
    t.release({ version: '0.0.1' });
    expect((await t.controller.check(false)).status).toBe('up-to-date');
  });

  it('shows a short error when the check fails (for example offline)', async () => {
    const t = setup();
    t.failCheck(new Error('net::ERR_INTERNET_DISCONNECTED\n at somewhere'));
    const s = await t.controller.check(false);
    expect(s.status).toBe('error');
    expect(s.error).toBe('net::ERR_INTERNET_DISCONNECTED');
    // A later check recovers.
    t.failCheck(null);
    t.release(null);
    expect((await t.controller.check(false)).status).toBe('up-to-date');
  });
});

describe('Later (snooze)', () => {
  it('hides the update for 24 hours for that version and a manual check brings it back', async () => {
    const t = setup();
    t.release({ version: '0.0.2' });
    await t.controller.check(false);
    const snoozed = t.controller.snooze('0.0.2');
    expect(snoozed.status).toBe('available');
    expect(snoozed.snoozedUntil).toBe(new Date(clock.getTime() + SNOOZE_MS).toISOString());

    clock = new Date(clock.getTime() + SNOOZE_MS - 1000);
    expect(t.controller.getState().snoozedUntil).not.toBeNull();
    clock = new Date(clock.getTime() + 2000);
    expect(t.controller.getState().snoozedUntil).toBeNull();

    t.controller.snooze('0.0.2');
    await t.controller.check(true);
    expect(t.controller.getState().snoozedUntil).toBeNull();
  });

  it('does not apply to a newer version', async () => {
    const t = setup();
    t.release({ version: '0.0.2' });
    await t.controller.check(false);
    t.controller.snooze('0.0.2');
    t.release({ version: '0.0.3' });
    await t.controller.check(false);
    expect(t.controller.getState().snoozedUntil).toBeNull();
  });
});

describe('Update now and Restart to install', () => {
  async function downloaded() {
    const t = setup();
    t.release({ version: '0.0.2', releaseNotes: 'Notes for 0.0.2' });
    await t.controller.check(false);
    await t.controller.download();
    return t;
  }

  it('downloads with progress, backs up the database, then waits for the restart', async () => {
    const t = await downloaded();
    expect(t.controller.getState()).toMatchObject({ status: 'downloaded', progressPercent: 100 });
    expect(t.states.some((s) => s.status === 'downloading' && s.progressPercent === 40)).toBe(true);
    expect(t.backups).toEqual([['0.0.1', '0.0.2']]);
    expect(t.calls.install).toBe(0);
  });

  it('backs the database up again right before installing, then installs', async () => {
    const t = await downloaded();
    t.controller.install();
    expect(t.backups).toEqual([
      ['0.0.1', '0.0.2'],
      ['0.0.1', '0.0.2'],
    ]);
    expect(t.calls.install).toBe(1);
  });

  it('never restarts while the user is busy, and says so', async () => {
    const t = await downloaded();
    t.controller.setBusy('focus-session', true);
    expect(t.controller.getState().busy).toBe(true);
    t.controller.install();
    expect(t.calls.install).toBe(0);
    t.controller.setBusy('focus-session', false);
    expect(t.controller.getState().busy).toBe(false);
    t.controller.install();
    expect(t.calls.install).toBe(1);
  });

  it('takes a safety backup when the app quits with an update waiting', async () => {
    const t = await downloaded();
    t.backups.length = 0;
    t.controller.prepareForQuit();
    expect(t.backups).toEqual([['0.0.1', '0.0.2']]);

    const idle = setup();
    idle.controller.prepareForQuit();
    expect(idle.backups).toEqual([]);
  });

  it('returns to available with an error if the download fails, and can retry', async () => {
    const t = setup();
    t.release({ version: '0.0.2' });
    await t.controller.check(false);
    t.failDownload(new Error('connection reset'));
    const failed = await t.controller.download();
    expect(failed).toMatchObject({ status: 'available', error: 'connection reset' });
    expect(t.backups).toEqual([]);
    t.failDownload(null);
    expect((await t.controller.download()).status).toBe('downloaded');
  });

  it('ignores install and download requests in the wrong state', async () => {
    const t = setup();
    t.controller.install();
    await t.controller.download();
    expect(t.calls.install + t.calls.download).toBe(0);
  });

  it('does not re-check while a download is ready', async () => {
    const t = await downloaded();
    t.release({ version: '0.0.3' });
    await t.controller.check(false);
    expect(t.controller.getState().latestVersion).toBe('0.0.2');
  });
});

describe('after an update', () => {
  it('shows "Updated to" once, with the notes saved at download time', async () => {
    const t = setup();
    t.release({ version: '0.0.2', releaseNotes: 'Notes for 0.0.2' });
    t.controller.start(); // first ever run: records 0.0.1, no card
    expect(t.controller.getState().justUpdated).toBeNull();
    await t.controller.check(false);
    await t.controller.download();
    t.controller.stop();

    const relaunched = t.make('0.0.2'); // the app restarted as 0.0.2
    relaunched.start();
    expect(relaunched.getState().justUpdated).toEqual({
      version: '0.0.2',
      releaseNotes: 'Notes for 0.0.2',
    });

    // It survives another restart until dismissed...
    const again = t.make('0.0.2');
    again.start();
    expect(again.getState().justUpdated?.version).toBe('0.0.2');
    // ...and is gone once dismissed.
    again.dismissUpdated();
    const third = t.make('0.0.2');
    third.start();
    expect(third.getState().justUpdated).toBeNull();
  });

  it('shows no card on an ordinary restart', () => {
    const t = setup();
    t.controller.start();
    const again = t.make('0.0.1');
    again.start();
    expect(again.getState().justUpdated).toBeNull();
  });
});

describe('normalizeReleaseNotes', () => {
  it('handles strings, per-version lists and empties', () => {
    expect(normalizeReleaseNotes('  hi  ')).toBe('hi');
    expect(normalizeReleaseNotes('   ')).toBeNull();
    expect(normalizeReleaseNotes(null)).toBeNull();
    expect(
      normalizeReleaseNotes([
        { version: '0.0.3', note: 'three' },
        { version: '0.0.2', note: null },
      ]),
    ).toBe('## 0.0.3\n\nthree');
  });
});
