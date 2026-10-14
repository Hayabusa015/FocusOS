import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { openDatabase } from '../../src/main/db/connection';
import type { Db } from '../../src/main/db/connection';
import { runMigrations } from '../../src/main/db/migrate';
import { SettingsStore } from '../../src/main/db/settings';
import { createStore } from '../../src/main/db/store';
import { createNotifier } from '../../src/main/notifier';
import { DEFAULT_SETTINGS } from '../../src/shared/core';

let db: Db;
let now: Date;
afterEach(() => db.close());
beforeEach(() => {
  now = new Date(2026, 9, 14, 9, 5, 0);
  db = openDatabase(':memory:');
  runMigrations(db);
});

function setup(settings = DEFAULT_SETTINGS) {
  const store = createStore(db, { clock: () => now });
  const kv = new SettingsStore(db);
  const shown: string[] = [];
  const notifier = createNotifier({
    store,
    kv,
    getSettings: () => settings,
    show: (n) => shown.push(n.title),
    now: () => now,
  });
  return { store, notifier, shown, kv };
}

describe('notifier', () => {
  it('notifies a due time once, even after a restart', () => {
    const { store, notifier, shown, kv } = setup();
    store.createTask({ title: 'Call', dueDate: '2026-10-14', dueTime: '09:00' });
    expect(notifier.tick()).toHaveLength(1);
    expect(notifier.tick()).toHaveLength(0);
    // A new notifier over the same database (an app restart) does not repeat it.
    const again = createNotifier({
      store,
      kv,
      getSettings: () => DEFAULT_SETTINGS,
      show: (n) => shown.push(n.title),
      now: () => now,
    });
    expect(again.tick()).toHaveLength(0);
    expect(shown).toEqual(['Due now']);
  });

  it('stays silent when notifications are off or during quiet hours', () => {
    const off = setup({ ...DEFAULT_SETTINGS, notificationsEnabled: false });
    off.store.createTask({ title: 'Call', dueDate: '2026-10-14', dueTime: '09:00' });
    expect(off.notifier.tick()).toHaveLength(0);
  });

  it('tells the user a maintenance item came due', () => {
    now = new Date(2026, 9, 14, 10, 0, 0);
    const { store, notifier } = setup();
    store.createMaintenance({ name: 'HVAC filter', intervalDays: 90, lastDone: '2026-06-01' });
    expect(notifier.tick().map((n) => n.title)).toEqual(['HVAC filter']);
  });

  it('sends the shutdown reminder once, and not after the ritual is done', () => {
    now = new Date(2026, 9, 14, 15, 35, 0);
    const { notifier, shown, store } = setup();
    expect(notifier.tick().map((n) => n.action)).toEqual(['shutdown']);
    expect(notifier.tick()).toHaveLength(0);
    expect(shown).toEqual(['Time to wind down']);
    // Another day, with the ritual done first: no reminder.
    now = new Date(2026, 9, 15, 15, 35, 0);
    store.completeShutdown();
    expect(notifier.tick()).toHaveLength(0);
  });
});
