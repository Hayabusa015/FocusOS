import { mkdtempSync, rmSync, readdirSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { openDatabase } from '../../src/main/db/connection';
import type { Db } from '../../src/main/db/connection';
import { runMigrations } from '../../src/main/db/migrate';
import { createStore } from '../../src/main/db/store';
import type { Store } from '../../src/main/db/store';
import { ensureDailyBackup, listDailyBackups } from '../../src/main/db/daily-backup';
import { readSettings, writeSettings } from '../../src/main/db/app-settings';
import { SettingsStore } from '../../src/main/db/settings';

// TZ is America/New_York (vitest.config.ts). 2026-10-14 is a Wednesday.
let now: Date;
let db: Db;
let store: Store;

const area = (name: string) => {
  const found = store.listAreas().find((a) => a.name === name);
  if (!found) throw new Error(`no area ${name}`);
  return found;
};

beforeEach(() => {
  now = new Date(2026, 9, 14, 10, 0, 0);
  db = openDatabase(':memory:');
  runMigrations(db);
  store = createStore(db, { clock: () => now });
  store.seedAreas();
});
afterEach(() => db.close());

describe('areas', () => {
  it('seeds the seven default areas', () => {
    expect(store.listAreas().map((a) => a.name)).toEqual([
      'Chemistry',
      'Physics',
      'Geology',
      'Coaching',
      'Home',
      'Admin',
      'Personal',
    ]);
  });

  it('renames, archives and undoes both', () => {
    const coaching = area('Coaching');
    const renamed = store.updateArea({ id: coaching.id, name: 'Track' });
    expect(area('Track').id).toBe(coaching.id);
    store.undo(renamed.logId);
    expect(area('Coaching').id).toBe(coaching.id);

    const archived = store.updateArea({ id: coaching.id, archived: true });
    expect(store.listAreas().some((a) => a.id === coaching.id)).toBe(false);
    expect(store.listAreas(true).some((a) => a.id === coaching.id)).toBe(true);
    store.undo(archived.logId);
    expect(store.listAreas().some((a) => a.id === coaching.id)).toBe(true);
  });

  it('undoing an area creation removes it', () => {
    const made = store.createArea({ name: 'Garden', kind: 'personal', colorToken: 'area-home' });
    expect(store.listAreas()).toHaveLength(8);
    store.undo(made.logId);
    expect(store.listAreas()).toHaveLength(7);
  });
});

describe('tasks', () => {
  it('captures into the Inbox, then moves to an area', () => {
    const { result } = store.capture('Grade quizzes');
    const task = result.task!;
    expect(task.status).toBe('inbox');
    expect(store.listTasks({ view: 'inbox' }).map((t) => t.id)).toEqual([task.id]);

    store.updateTask({ id: task.id, areaId: area('Chemistry').id });
    expect(store.listTasks({ view: 'inbox' })).toHaveLength(0);
    expect(store.getTask(task.id)?.status).toBe('todo');
    expect(store.listTasks({ view: 'area', areaId: area('Chemistry').id })).toHaveLength(1);
  });

  it('parses #area and !date in capture', () => {
    const { result } = store.capture('Call plumber #home !fri');
    expect(result.task?.areaId).toBe(area('Home').id);
    expect(result.task?.dueDate).toBe('2026-10-16');
    expect(result.task?.title).toBe('Call plumber');
  });

  it('empty capture saves nothing', () => {
    const out = store.capture('   ');
    expect(out.result.task).toBeNull();
    expect(out.logId).toBeNull();
  });

  it('completing a repeating task makes the next one, and undo removes it', () => {
    const made = store.createTask({
      title: 'Weekly report',
      areaId: area('Admin').id,
      dueDate: '2026-10-14',
      recurrence: { freq: 'weekly', days: [3] },
    });
    const done = store.completeTask(made.result.id);
    expect(done.result.task.status).toBe('done');
    expect(done.result.next?.dueDate).toBe('2026-10-21');
    // The area board shows the finished one (done this week) and the new open one.
    expect(store.listTasks({ view: 'area', areaId: area('Admin').id })).toHaveLength(2);

    store.undo(done.logId);
    expect(store.getTask(made.result.id)?.status).not.toBe('done');
    expect(store.getTask(done.result.next!.id)).toBeNull();
  });

  it('skips missed occurrences instead of piling up overdue copies', () => {
    const made = store.createTask({
      title: 'Daily',
      areaId: area('Admin').id,
      dueDate: '2026-10-01',
      recurrence: { freq: 'every_n_days', n: 1 },
    });
    const done = store.completeTask(made.result.id);
    // Missed days are skipped; the next instance is due today, not a stack of overdue copies.
    expect(done.result.next?.dueDate).toBe('2026-10-14');
  });

  it('completes open subtasks with the parent and undo restores them', () => {
    const parent = store.createTask({ title: 'Unit test prep', areaId: area('Physics').id });
    const sub = store.createTask({ title: 'Write key', parentId: parent.result.id });
    expect(store.getTask(parent.result.id)?.subtaskCount).toBe(1);
    const done = store.completeTask(parent.result.id);
    expect(store.getTask(sub.result.id)?.status).toBe('done');
    store.undo(done.logId);
    expect(store.getTask(sub.result.id)?.status).not.toBe('done');
  });

  it('refuses a subtask of a subtask', () => {
    const parent = store.createTask({ title: 'A' });
    const sub = store.createTask({ title: 'B', parentId: parent.result.id });
    expect(() => store.createTask({ title: 'C', parentId: sub.result.id })).toThrow();
  });

  it('reopens a finished task', () => {
    const t = store.createTask({ title: 'One-off', areaId: area('Home').id });
    store.completeTask(t.result.id);
    const re = store.reopenTask(t.result.id);
    expect(re.result.status).not.toBe('done');
    expect(re.result.completedAt).toBeNull();
  });

  it('soft-deletes with subtasks and undoes', () => {
    const parent = store.createTask({ title: 'P', areaId: area('Home').id });
    const sub = store.createTask({ title: 'S', parentId: parent.result.id });
    const del = store.deleteTask(parent.result.id);
    expect(store.getTask(parent.result.id)).toBeNull();
    expect(store.getTask(sub.result.id)).toBeNull();
    store.undo(del.logId);
    expect(store.getTask(parent.result.id)).not.toBeNull();
    expect(store.getTask(sub.result.id)).not.toBeNull();
  });

  it('counts a deferral when the due date moves later, and undoes it', () => {
    const t = store.createTask({ title: 'Plan', dueDate: '2026-10-14' });
    const moved = store.rescheduleTask(t.result.id, '2026-10-20');
    expect(moved.result.deferCount).toBe(1);
    store.undo(moved.logId);
    expect(store.getTask(t.result.id)).toMatchObject({ dueDate: '2026-10-14', deferCount: 0 });
  });

  it('undo reverses an update', () => {
    const t = store.createTask({ title: 'Old title', areaId: area('Home').id });
    const up = store.updateTask({ id: t.result.id, title: 'New title', size: 'l' });
    expect(store.getTask(t.result.id)?.title).toBe('New title');
    store.undo(up.logId);
    expect(store.getTask(t.result.id)).toMatchObject({ title: 'Old title', size: 's' });
  });

  it('undo reverses a creation and cannot be applied twice', () => {
    const t = store.createTask({ title: 'Oops' });
    expect(store.undo(t.logId)).not.toBeNull();
    expect(store.getTask(t.result.id)).toBeNull();
    expect(store.undo(t.logId)).toBeNull();
  });

  it('undoLatest undoes the newest change', () => {
    store.createTask({ title: 'First' });
    const second = store.createTask({ title: 'Second' });
    const undone = store.undoLatest();
    expect(undone?.id).toBe(second.logId);
    expect(store.listTasks({ view: 'inbox' }).map((t) => t.title)).toEqual(['First']);
  });

  it('searches titles and treats % and _ literally', () => {
    store.createTask({ title: '100% sure' });
    store.createTask({ title: 'plain' });
    expect(store.search('100%').tasks).toHaveLength(1);
    expect(store.search('%').tasks).toHaveLength(1);
    expect(store.search('PLAIN').tasks).toHaveLength(1);
  });
});

describe('undo covers every kind of change', () => {
  const snapshot = () =>
    JSON.stringify(
      ['areas', 'tasks', 'maintenance_items', 'maintenance_log'].map((t) =>
        db.prepare(`SELECT * FROM ${t} ORDER BY id`).all(),
      ),
    );

  it('undoing a whole session of changes, newest first, restores the data exactly', () => {
    const before = snapshot();
    const logged: string[] = [];
    const track = <T extends { logId: string | null }>(m: T): T => {
      if (m.logId) logged.push(m.logId);
      return m;
    };

    const home = area('Home');
    track(store.createArea({ name: 'Garden', kind: 'personal', colorToken: 'area-home' }));
    track(store.updateArea({ id: home.id, name: 'House' }));
    const task = track(
      store.createTask({
        title: 'Repeat me',
        areaId: home.id,
        dueDate: '2026-10-14',
        recurrence: { freq: 'daily' },
      }),
    ).result;
    const step = track(store.createTask({ title: 'Step', parentId: task.id })).result;
    track(store.updateTask({ id: task.id, title: 'Repeat me, edited', size: 'l' }));
    track(store.rescheduleTask(task.id, '2026-10-20'));
    track(store.completeTask(task.id));
    track(store.reopenTask(step.id));
    track(store.deleteTask(step.id));
    const item = track(store.createMaintenance({ name: 'Filter', intervalDays: 90 })).result;
    track(store.updateMaintenance({ id: item.id, leadDays: 3 }));
    track(store.markMaintenanceDone(item.id));
    track(store.deleteMaintenance(item.id));
    track(store.capture('Quick one #admin'));
    const other = track(store.createTask({ title: 'Other', areaId: home.id })).result;
    track(store.reorderTasks([other.id, task.id]));
    track(store.updateTask({ id: other.id, parentId: task.id }));
    track(store.updateTask({ id: other.id, parentId: null }));

    expect(snapshot()).not.toBe(before);
    for (const id of [...logged].reverse()) expect(store.undo(id)).not.toBeNull();
    expect(snapshot()).toBe(before);
  });
});

describe('manual order and steps', () => {
  const titles = (tasks: { title: string }[]) => tasks.map((t) => t.title);

  it('lists new tasks at the end and reorders by drag', () => {
    const a = store.createTask({ title: 'A', areaId: area('Home').id }).result;
    const b = store.createTask({ title: 'B', areaId: area('Home').id }).result;
    const c = store.createTask({ title: 'C', areaId: area('Home').id }).result;
    const home = { view: 'area', areaId: area('Home').id } as const;
    expect(titles(store.listTasks(home))).toEqual(['A', 'B', 'C']);

    const moved = store.reorderTasks([c.id, a.id, b.id]);
    expect(titles(store.listTasks(home))).toEqual(['C', 'A', 'B']);
    // A task added after a reorder still goes to the end.
    store.createTask({ title: 'D', areaId: area('Home').id });
    expect(titles(store.listTasks(home))).toEqual(['C', 'A', 'B', 'D']);

    store.undo(moved.logId);
    expect(titles(store.listTasks(home))).toEqual(['A', 'B', 'C', 'D']);
  });

  it('a drag in a filtered list leaves the other tasks where they were', () => {
    const a = store.createTask({ title: 'A', areaId: area('Home').id }).result;
    store.createTask({ title: 'Other', areaId: area('Admin').id });
    const c = store.createTask({ title: 'C', areaId: area('Home').id }).result;
    store.reorderTasks([c.id, a.id]);
    expect(titles(store.listTasks({ view: 'area', areaId: area('Home').id }))).toEqual(['C', 'A']);
    expect(titles(store.listTasks({ view: 'area', areaId: area('Admin').id }))).toEqual(['Other']);
  });

  it('a reorder that changes nothing logs nothing', () => {
    const a = store.createTask({ title: 'A' }).result;
    const before = store.listLog(50).length;
    const out = store.reorderTasks([a.id]);
    expect(out.logId).toBe('');
    expect(store.listLog(50)).toHaveLength(before);
  });

  it('indents a task under another and outdents it back, with undo', () => {
    const parent = store.createTask({ title: 'Parent', areaId: area('Home').id }).result;
    const child = store.createTask({ title: 'Child', areaId: area('Home').id }).result;

    const indent = store.updateTask({ id: child.id, parentId: parent.id });
    expect(indent.result.parentId).toBe(parent.id);
    expect(store.getTask(parent.id)?.subtaskCount).toBe(1);
    expect(titles(store.listTasks({ view: 'area', areaId: area('Home').id }))).toEqual(['Parent']);

    const outdent = store.updateTask({ id: child.id, parentId: null });
    expect(outdent.result.parentId).toBeNull();
    expect(titles(store.listTasks({ view: 'area', areaId: area('Home').id }))).toEqual([
      'Parent',
      'Child',
    ]);
    store.undo(outdent.logId);
    expect(store.getTask(child.id)?.parentId).toBe(parent.id);
  });

  it('keeps steps one level deep', () => {
    const a = store.createTask({ title: 'A' }).result;
    const b = store.createTask({ title: 'B' }).result;
    const c = store.createTask({ title: 'C' }).result;
    store.updateTask({ id: b.id, parentId: a.id });
    // C cannot go under B (already a step), and A cannot go under C (it has steps).
    expect(() => store.updateTask({ id: c.id, parentId: b.id })).toThrow(/one level/);
    expect(() => store.updateTask({ id: a.id, parentId: c.id })).toThrow(/one level/);
    expect(() => store.updateTask({ id: a.id, parentId: a.id })).toThrow();
  });

  it('orders steps by their manual order and lists steps for many tasks at once', () => {
    const p = store.createTask({ title: 'P' }).result;
    const s1 = store.createTask({ title: 's1', parentId: p.id }).result;
    const s2 = store.createTask({ title: 's2', parentId: p.id }).result;
    store.reorderTasks([s2.id, s1.id]);
    expect(titles(store.listChildren([p.id])[p.id] ?? [])).toEqual(['s2', 's1']);
  });

  it('Today lists what was finished today, so the daily list can show it checked off', () => {
    const t = store.createTask({ title: 'Done thing', dueDate: '2026-10-14' }).result;
    store.createTask({ title: 'Open thing', dueDate: '2026-10-14' });
    store.completeTask(t.id);
    const view = store.getToday({ dayStart: '07:00', dayEnd: '22:00' });
    expect(titles(view.doneToday)).toEqual(['Done thing']);
    expect(titles(view.dueToday)).toEqual(['Open thing']);
  });

  it('the daily list follows the manual order', () => {
    const a = store.createTask({ title: 'A', dueDate: '2026-10-14', dueTime: '09:00' }).result;
    const b = store.createTask({ title: 'B', dueDate: '2026-10-14', dueTime: '08:00' }).result;
    expect(titles(store.listDueOn('2026-10-14'))).toEqual(['A', 'B']);
    store.reorderTasks([b.id, a.id]);
    expect(titles(store.listDueOn('2026-10-14'))).toEqual(['B', 'A']);
  });
});

describe('views', () => {
  it('Today lists due and carried-forward tasks, and counts what is done', () => {
    const due = store.createTask({ title: 'Due today', dueDate: '2026-10-14' });
    store.createTask({ title: 'Late', dueDate: '2026-10-12' });
    store.createTask({ title: 'Later', dueDate: '2026-10-20' });
    const view = store.getToday({ dayStart: '07:00', dayEnd: '22:00' });
    expect(view.date).toBe('2026-10-14');
    expect(view.dueToday.map((t) => t.title)).toEqual(['Due today']);
    expect(view.carryForward.map((t) => t.title)).toEqual(['Late']);
    expect(view.arc.phase).toBe('during');

    store.completeTask(due.result.id);
    expect(store.getToday({ dayStart: '07:00', dayEnd: '22:00' }).counters.tasksDone).toBe(1);
  });

  it('Today shows a time block as Now, and the next one', () => {
    store.createTask({
      title: 'Teach',
      block: { date: '2026-10-14', time: '09:30', minutes: 60 },
    });
    store.createTask({
      title: 'Grade',
      block: { date: '2026-10-14', time: '11:00', minutes: 30 },
    });
    const view = store.getToday({ dayStart: '07:00', dayEnd: '22:00' });
    expect(view.nowBlock?.title).toBe('Teach');
    expect(view.nowBlock?.minutesLeft).toBe(30);
    expect(view.nextBlock?.title).toBe('Grade');
    expect(view.nextBlock?.startsInMinutes).toBe(60);
  });

  it('Upcoming covers 14 days', () => {
    store.createTask({ title: 'In 3 days', dueDate: '2026-10-17' });
    store.createTask({ title: 'In 30 days', dueDate: '2026-11-20' });
    const up = store.getUpcoming();
    expect(up.today).toBe('2026-10-14');
    const titles = up.days.flatMap((d) => d.tasks.map((t) => t.title));
    expect(titles).toContain('In 3 days');
    expect(titles).not.toContain('In 30 days');
  });
});

describe('maintenance', () => {
  it('shows "last done N days ago" and appears in Upcoming at lead_days', () => {
    const made = store.createMaintenance({
      name: 'Change HVAC filter',
      intervalDays: 90,
      lastDone: '2026-07-16', // due 2026-10-14 + ... 90 days later = 2026-10-14
      leadDays: 7,
    });
    expect(made.result.statusText).toMatch(/Last done 90 days ago/);

    const early = store.createMaintenance({
      name: 'Smoke test',
      intervalDays: 30,
      lastDone: '2026-10-04', // due 2026-11-03: 20 days away
      leadDays: 7,
    });
    expect(early.result.state).toBe('ok');
    const inUpcoming = (name: string) =>
      store
        .getUpcoming()
        .days.flatMap((d) => d.maintenance)
        .some((m) => m.name === name);
    expect(inUpcoming('Smoke test')).toBe(false);

    now = new Date(2026, 9, 28, 10, 0, 0); // 6 days before due: inside the 7-day lead
    expect(inUpcoming('Smoke test')).toBe(true);
  });

  it('marking done writes a log row and undo reverses it', () => {
    const made = store.createMaintenance({ name: 'Dryer vent', intervalDays: 365 });
    expect(made.result.lastDone).toBeNull();
    const done = store.markMaintenanceDone(made.result.id);
    expect(done.result.lastDone).toBe('2026-10-14');
    expect(db.prepare('SELECT COUNT(*) AS n FROM maintenance_log').get()).toEqual({ n: 1 });

    store.undo(done.logId);
    expect(store.getMaintenance(made.result.id)?.lastDone).toBeNull();
    expect(db.prepare('SELECT COUNT(*) AS n FROM maintenance_log').get()).toEqual({ n: 0 });
  });

  it('undoes an edit and a delete', () => {
    const made = store.createMaintenance({ name: 'Oil', intervalDays: 180 });
    const up = store.updateMaintenance({ id: made.result.id, intervalDays: 90 });
    expect(store.getMaintenance(made.result.id)?.intervalDays).toBe(90);
    store.undo(up.logId);
    expect(store.getMaintenance(made.result.id)?.intervalDays).toBe(180);

    const del = store.deleteMaintenance(made.result.id);
    expect(store.getMaintenance(made.result.id)).toBeNull();
    store.undo(del.logId);
    expect(store.getMaintenance(made.result.id)).not.toBeNull();
  });

  it('files new items under Home', () => {
    const made = store.createMaintenance({ name: 'Gutters', intervalDays: 180 });
    expect(made.result.areaId).toBe(area('Home').id);
  });
});

describe('settings', () => {
  it('returns defaults, then saved values, and validates the day window', () => {
    const kv = new SettingsStore(db);
    expect(readSettings(kv).captureHotkey).toBe('Control+Alt+N');
    writeSettings(kv, { dayStart: '06:00' });
    expect(readSettings(kv)).toMatchObject({ dayStart: '06:00', dayEnd: '22:00' });
    expect(() => writeSettings(kv, { dayEnd: '05:00' })).toThrow();
  });
});

describe('daily backup', () => {
  let dir: string;
  let file: Db | null = null;
  beforeEach(() => {
    dir = mkdtempSync(join(tmpdir(), 'cortex-bk-'));
  });
  afterEach(() => {
    file?.close();
    file = null;
    rmSync(dir, { recursive: true, force: true });
  });

  it('makes one backup a day and keeps the newest ones', () => {
    store.createTask({ title: 'In the backup' });
    expect(ensureDailyBackup(db, dir, '2026-10-14')).toEqual({ created: true, pruned: 0 });
    expect(ensureDailyBackup(db, dir, '2026-10-14')).toEqual({ created: false, pruned: 0 });

    file = openDatabase(join(dir, 'daily-2026-10-14.db'));
    expect(file.prepare('SELECT COUNT(*) AS n FROM tasks').get()).toEqual({ n: 1 });
    file.close();
    file = null;

    ensureDailyBackup(db, dir, '2026-10-15');
    ensureDailyBackup(db, dir, '2026-10-16');
    const result = ensureDailyBackup(db, dir, '2026-10-17', 2);
    expect(result.pruned).toBe(2);
    expect(listDailyBackups(dir).dates).toEqual(['2026-10-17', '2026-10-16']);
    expect(readdirSync(dir)).toHaveLength(2);
  });
});
