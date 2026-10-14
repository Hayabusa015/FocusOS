import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { openDatabase } from '../../src/main/db/connection';
import type { Db } from '../../src/main/db/connection';
import { runMigrations } from '../../src/main/db/migrate';
import { createStore } from '../../src/main/db/store';
import type { Store } from '../../src/main/db/store';

// TZ is America/New_York (vitest.config.ts). 2026-10-14 is a Wednesday.
let now: Date;
let db: Db;
let store: Store;

const area = (name: string) => store.listAreas().find((a) => a.name === name)!;
const total = () => store.getSummary().totalXp;
const ledgerSum = () =>
  Number(
    (db.prepare('SELECT COALESCE(SUM(points), 0) AS s FROM xp_events').get() as { s: number }).s,
  );
const eventCount = () =>
  Number((db.prepare('SELECT COUNT(*) AS n FROM xp_events').get() as { n: number }).n);
const liveWins = () => store.getWins().todayWins.map((w) => w.text);

beforeEach(() => {
  now = new Date(2026, 9, 14, 10, 0, 0);
  db = openDatabase(':memory:');
  runMigrations(db);
  store = createStore(db, { clock: () => now });
  store.seedAreas();
});
afterEach(() => db.close());

describe('task XP', () => {
  it('awards 10, 20 and 40 by size', () => {
    const s = store.createTask({ title: 'S', size: 's', areaId: area('Home').id }).result;
    const m = store.createTask({ title: 'M', size: 'm', areaId: area('Home').id }).result;
    const l = store.createTask({ title: 'L', size: 'l', areaId: area('Home').id }).result;
    store.completeTask(s.id);
    expect(total()).toBe(10);
    store.completeTask(m.id);
    expect(total()).toBe(30);
    store.completeTask(l.id);
    expect(total()).toBe(70);
  });

  it('does not pay for steps, only for the main task', () => {
    const p = store.createTask({ title: 'P', areaId: area('Home').id }).result;
    const step = store.createTask({ title: 'step', parentId: p.id }).result;
    store.completeTask(step.id);
    expect(total()).toBe(0);
    store.completeTask(p.id);
    expect(total()).toBe(10);
  });

  it('pays a frog 50% more: put off twice then finished', () => {
    const t = store.createTask({
      title: 'Avoided',
      dueDate: '2026-10-14',
      areaId: area('Admin').id,
    }).result;
    store.rescheduleTask(t.id, '2026-10-15');
    store.rescheduleTask(t.id, '2026-10-16');
    expect(store.getTask(t.id)?.deferCount).toBe(2);
    store.completeTask(t.id);
    expect(total()).toBe(15);
  });

  it('takes the points back on undo with a negative event, never deleting a row', () => {
    const t = store.createTask({ title: 'T', areaId: area('Home').id }).result;
    const done = store.completeTask(t.id);
    expect(eventCount()).toBe(1);
    store.undo(done.logId);
    expect(total()).toBe(0);
    expect(eventCount()).toBe(2);
    expect(db.prepare('SELECT points FROM xp_events ORDER BY created_at, rowid').all()).toEqual([
      { points: 10 },
      { points: -10 },
    ]);
    // Finishing it again earns again.
    store.completeTask(t.id);
    expect(total()).toBe(10);
  });

  it('bringing a slipped task forward to today is not a deferral', () => {
    const t = store.createTask({
      title: 'Slipped',
      dueDate: '2026-10-12',
      areaId: area('Home').id,
    }).result;
    store.rescheduleTask(t.id, '2026-10-14');
    expect(store.getTask(t.id)?.deferCount).toBe(0);
    // Pushing it past today is.
    store.rescheduleTask(t.id, '2026-10-15');
    expect(store.getTask(t.id)?.deferCount).toBe(1);
  });

  it('reopening a task takes its points back too', () => {
    const t = store.createTask({ title: 'T', size: 'm', areaId: area('Home').id }).result;
    store.completeTask(t.id);
    store.reopenTask(t.id);
    expect(total()).toBe(0);
  });

  it('deleting a finished task takes its points back, and undoing the delete returns them', () => {
    const t = store.createTask({ title: 'T', areaId: area('Home').id }).result;
    store.completeTask(t.id);
    const del = store.deleteTask(t.id);
    expect(total()).toBe(0);
    store.undo(del.logId);
    expect(total()).toBe(10);
  });

  it('the total always equals what the data says, after any mix of changes and undos', () => {
    // A small seeded generator, so a failure can be replayed.
    let seed = 20261014;
    const rand = (n: number) => {
      seed = (seed * 1664525 + 1013904223) >>> 0;
      return seed % n;
    };
    const home = area('Home').id;
    const sizes = ['s', 'm', 'l', 's', 'm'] as const;
    const ids = sizes.map(
      (size, i) => store.createTask({ title: `T${i}`, size, areaId: home }).result.id,
    );
    const parent = ids[0]!;
    const item = store.createMaintenance({ name: 'Filter', intervalDays: 30 }).result.id;
    const logs: string[] = [];

    const expectedFromData = () => {
      const tasks = (
        db
          .prepare(
            "SELECT size, defer_count FROM tasks WHERE status = 'done' AND deleted_at IS NULL AND parent_id IS NULL",
          )
          .all() as { size: 's' | 'm' | 'l'; defer_count: number }[]
      ).reduce(
        (sum, t) => sum + { s: 10, m: 20, l: 40 }[t.size] * (t.defer_count >= 2 ? 1.5 : 1),
        0,
      );
      const maintenance =
        15 *
        Number((db.prepare('SELECT COUNT(*) AS n FROM maintenance_log').get() as { n: number }).n);
      const inboxZero = Number(
        (
          db
            .prepare(
              "SELECT COALESCE(SUM(points), 0) AS s FROM xp_events WHERE kind = 'inbox-zero'",
            )
            .get() as { s: number }
        ).s,
      );
      return tasks + maintenance + inboxZero;
    };

    for (let step = 0; step < 300; step++) {
      const id = ids[rand(ids.length)]!;
      try {
        switch (rand(12)) {
          case 0:
            logs.push(store.completeTask(id).logId);
            break;
          case 1:
            logs.push(store.reopenTask(id).logId);
            break;
          case 2:
            logs.push(store.rescheduleTask(id, `2026-10-${15 + rand(10)}`).logId);
            break;
          case 3:
            store.undoLatest();
            break;
          case 4:
            if (logs.length) store.undo(logs[rand(logs.length)]!);
            break;
          case 5:
            logs.push(store.deleteTask(id).logId);
            break;
          case 6:
            logs.push(store.updateTask({ id, size: sizes[rand(3)]! }).logId);
            break;
          case 7:
            logs.push(store.markMaintenanceDone(item).logId);
            break;
          case 8:
            logs.push(store.createTask({ title: 'step', parentId: parent }).logId);
            break;
          case 9:
            logs.push(store.capture('Quick').logId ?? '');
            break;
          case 10:
            logs.push(store.updateTask({ id, areaId: rand(2) ? null : home }).logId);
            break;
          default:
            now = new Date(now.getTime() + rand(3) * 86_400_000);
        }
      } catch {
        // Some steps are refused (undoing something already undone, a missing task).
      }
      expect(total()).toBe(ledgerSum());
      expect(total()).toBe(expectedFromData());
    }
    // No row was ever deleted: only added.
    expect(eventCount()).toBeGreaterThan(0);
  });
});

describe('wins', () => {
  it('a finished task writes a win, and undoing it takes the win away', () => {
    const t = store.createTask({ title: 'Grade quizzes', areaId: area('Chemistry').id }).result;
    const done = store.completeTask(t.id);
    expect(liveWins()).toEqual(['Grade quizzes']);
    store.undo(done.logId);
    expect(liveWins()).toEqual([]);
    store.completeTask(t.id);
    expect(liveWins()).toEqual(['Grade quizzes']);
    expect(db.prepare('SELECT COUNT(*) AS n FROM wins').get()).toEqual({ n: 1 });
  });

  it('you can log a win in your own words, and undo it', () => {
    const logged = store.logWin('Handled a tough parent call');
    expect(liveWins()).toEqual(['Handled a tough parent call']);
    store.undo(logged.logId);
    expect(liveWins()).toEqual([]);
  });

  it('maintenance done writes a win and 15 XP; undo reverses both', () => {
    const item = store.createMaintenance({ name: 'HVAC filter', intervalDays: 90 }).result;
    const done = store.markMaintenanceDone(item.id);
    expect(total()).toBe(15);
    expect(liveWins()).toEqual(['Home: HVAC filter']);
    store.undo(done.logId);
    expect(total()).toBe(0);
    expect(liveWins()).toEqual([]);
  });

  it('three wins make an active day for the streak', () => {
    for (const title of ['A', 'B', 'C']) {
      store.completeTask(store.createTask({ title, areaId: area('Home').id }).result.id);
    }
    const summary = store.getSummary();
    expect(summary.winsToday).toBe(3);
    expect(summary.streak.active).toBe(1);
    expect(summary.streak.days.at(-1)).toMatchObject({ date: '2026-10-14', active: true });
  });
});

describe('inbox emptied', () => {
  it('pays 10 once a day when the inbox is cleared, and takes it back if that is undone', () => {
    const a = store.capture('Look into field trips').result.task!;
    expect(total()).toBe(0);
    const filed = store.updateTask({ id: a.id, areaId: area('Admin').id });
    expect(total()).toBe(10);
    store.undo(filed.logId);
    expect(total()).toBe(0);
    store.updateTask({ id: a.id, areaId: area('Admin').id });
    expect(total()).toBe(10);
    // Another capture and another clearing the same day does not pay twice.
    const b = store.capture('Another').result.task!;
    store.updateTask({ id: b.id, areaId: area('Admin').id });
    expect(total()).toBe(10);
  });

  it('a capture after the inbox was emptied does not take the XP back', () => {
    const a = store.capture('First').result.task!;
    store.updateTask({ id: a.id, areaId: area('Admin').id });
    expect(total()).toBe(10);
    store.capture('Second');
    expect(total()).toBe(10);
    expect(store.takeAward().xp).toBe(10);
  });

  it('capturing and undoing the capture does not farm the bonus', () => {
    const made = store.capture('Oops');
    store.undo(made.logId!);
    expect(total()).toBe(0);
  });

  it('pays nothing for an inbox that was never used', () => {
    store.createTask({ title: 'Straight to an area', areaId: area('Home').id });
    expect(total()).toBe(0);
  });
});

describe('achievements', () => {
  it('unlocks First Capture on the first task, once, and reports it once', () => {
    store.createTask({ title: 'First' });
    const award = store.takeAward();
    expect(award.unlocked.map((u) => u.title)).toEqual(['First Capture']);
    store.createTask({ title: 'Second' });
    expect(store.takeAward().unlocked).toEqual([]);
    expect(store.getSummary().achievementsUnlocked).toBe(1);
  });

  it('keeps an achievement after the thing is undone', () => {
    const made = store.createTask({ title: 'First' });
    store.undo(made.logId);
    expect(
      store.getWins().achievements.find((a) => a.key === 'first-capture')?.unlockedAt,
    ).not.toBeNull();
  });

  it('Clean Sweep: every task due today is done, and it is a big moment', () => {
    const a = store.createTask({
      title: 'A',
      dueDate: '2026-10-14',
      areaId: area('Home').id,
    }).result;
    const b = store.createTask({
      title: 'B',
      dueDate: '2026-10-14',
      areaId: area('Home').id,
    }).result;
    store.takeAward();
    store.completeTask(a.id);
    expect(store.takeAward().unlocked).toEqual([]);
    store.completeTask(b.id);
    const award = store.takeAward();
    expect(award.unlocked.map((u) => u.key)).toContain('clean-sweep');
    expect(award.big).toBe(true);
    expect(award.xp).toBe(10);
  });

  it('a large task is a big moment; a small one is not', () => {
    const s = store.createTask({ title: 'S', areaId: area('Home').id }).result;
    const l = store.createTask({ title: 'L', size: 'l', areaId: area('Home').id }).result;
    store.takeAward();
    store.completeTask(s.id);
    expect(store.takeAward().big).toBe(false);
    store.completeTask(l.id);
    expect(store.takeAward()).toMatchObject({ big: true, xp: 40 });
  });

  it('Homekeeper after 5 maintenance entries', () => {
    const item = store.createMaintenance({ name: 'Filter', intervalDays: 30 }).result;
    for (let i = 0; i < 5; i++) store.markMaintenanceDone(item.id);
    expect(
      store.getWins().achievements.find((a) => a.key === 'homekeeper')?.unlockedAt,
    ).not.toBeNull();
  });

  it('level 5 unlocks from the XP total', () => {
    // 1500 XP is level 5. Each large task is 40.
    for (let i = 0; i < 38; i++) {
      store.completeTask(
        store.createTask({ title: `L${i}`, size: 'l', areaId: area('Home').id }).result.id,
      );
    }
    expect(total()).toBe(1520);
    expect(store.getSummary().level).toBe(5);
    expect(
      store.getWins().achievements.find((a) => a.key === 'level-5')?.unlockedAt,
    ).not.toBeNull();
  });
});

describe('focus sessions', () => {
  it('a completed 25 minute session earns 5 XP', () => {
    const t = store.createTask({ title: 'Plan the unit', areaId: area('Physics').id }).result;
    const session = store.startFocus({ taskId: t.id, plannedMinutes: 25 });
    expect(store.activeFocus()?.id).toBe(session.id);
    now = new Date(now.getTime() + 25 * 60_000);
    const result = store.finishFocus(session.id, true);
    expect(result.xp).toBe(5);
    expect(total()).toBe(5);
    expect(store.activeFocus()).toBeNull();
  });

  it('ending early without finishing earns nothing', () => {
    const session = store.startFocus({ plannedMinutes: 25 });
    now = new Date(now.getTime() + 20 * 60_000);
    expect(store.finishFocus(session.id, false).xp).toBe(0);
    expect(total()).toBe(0);
  });

  it('finishing early counts only the minutes that ran', () => {
    const session = store.startFocus({ plannedMinutes: 45 });
    now = new Date(now.getTime() + 12 * 60_000 + 30_000);
    expect(store.finishFocus(session.id, true).xp).toBe(2);
  });

  it('never counts more than was planned', () => {
    const session = store.startFocus({ plannedMinutes: 10 });
    now = new Date(now.getTime() + 60 * 60_000);
    expect(store.finishFocus(session.id, true).xp).toBe(2);
  });

  it('only one session at a time, and finishing twice is harmless', () => {
    const session = store.startFocus({ plannedMinutes: 10 });
    expect(() => store.startFocus({ plannedMinutes: 10 })).toThrow(/already running/);
    now = new Date(now.getTime() + 10 * 60_000);
    store.finishFocus(session.id, true);
    expect(store.finishFocus(session.id, true).xp).toBe(0);
    expect(total()).toBe(2);
  });

  it('Deep Work unlocks at 45 completed minutes', () => {
    const session = store.startFocus({ plannedMinutes: 45 });
    now = new Date(now.getTime() + 45 * 60_000);
    store.finishFocus(session.id, true);
    expect(
      store.getWins().achievements.find((a) => a.key === 'deep-work')?.unlockedAt,
    ).not.toBeNull();
  });

  it('a session left over from long ago is ended, not resumed', () => {
    store.startFocus({ plannedMinutes: 25 });
    now = new Date(now.getTime() + 6 * 60 * 60_000);
    expect(store.activeFocus()).toBeNull();
  });
});

describe('morning briefing', () => {
  it('is due after 5:00 until it is shown', () => {
    now = new Date(2026, 9, 14, 4, 30);
    expect(store.ritualState({ briefingEnabled: true }).briefingDue).toBe(false);
    now = new Date(2026, 9, 14, 5, 0);
    expect(store.ritualState({ briefingEnabled: true }).briefingDue).toBe(true);
    expect(store.ritualState({ briefingEnabled: false }).briefingDue).toBe(false);
    store.markBriefingShown();
    expect(store.ritualState({ briefingEnabled: true }).briefingDue).toBe(false);
    now = new Date(2026, 9, 15, 7, 0);
    expect(store.ritualState({ briefingEnabled: true }).briefingDue).toBe(true);
  });

  it('offers up to three tasks to pick a first thing from: due today, then carried forward', () => {
    store.createTask({ title: 'Late', dueDate: '2026-10-12', areaId: area('Home').id });
    store.createTask({ title: 'Today 1', dueDate: '2026-10-14', areaId: area('Home').id });
    store.createTask({ title: 'Today 2', dueDate: '2026-10-14', areaId: area('Home').id });
    store.createTask({ title: 'Today 3', dueDate: '2026-10-14', areaId: area('Home').id });
    expect(store.briefing().picks.map((t) => t.title)).toEqual(['Today 1', 'Today 2', 'Today 3']);
    expect(store.briefing().carryForward.map((t) => t.title)).toEqual(['Late']);
  });

  it('fills the picks from carried-forward and undated tasks when today is light', () => {
    store.createTask({ title: 'Today 1', dueDate: '2026-10-14', areaId: area('Home').id });
    store.createTask({ title: 'Late', dueDate: '2026-10-12', areaId: area('Home').id });
    store.createTask({ title: 'Someday-ish', areaId: area('Home').id });
    expect(store.briefing().picks.map((t) => t.title)).toEqual(['Today 1', 'Late', 'Someday-ish']);
  });
});

describe('shutdown ritual', () => {
  it("lists unfinished tasks dated today, including time blocks, and tomorrow's first three", () => {
    store.createTask({ title: 'Due', dueDate: '2026-10-14', areaId: area('Home').id });
    store.createTask({
      title: 'Blocked',
      block: { date: '2026-10-14', time: '14:00', minutes: 30 },
      areaId: area('Home').id,
    });
    for (const n of [1, 2, 3, 4]) {
      store.createTask({ title: `Tomorrow ${n}`, dueDate: '2026-10-15', areaId: area('Home').id });
    }
    const view = store.shutdown();
    expect(view.unfinished.map((t) => t.title).sort()).toEqual(['Blocked', 'Due']);
    expect(view.tomorrow.map((t) => t.title)).toEqual(['Tomorrow 1', 'Tomorrow 2', 'Tomorrow 3']);
    expect(view.tomorrowDate).toBe('2026-10-15');
  });

  it('refuses to finish while anything dated today is open', () => {
    store.createTask({ title: 'Still open', dueDate: '2026-10-14', areaId: area('Home').id });
    expect(() => store.completeShutdown()).toThrow(/still open/);
    expect(total()).toBe(0);
  });

  it('leaves zero unfinished tasks dated today, and earns 10 XP once', () => {
    const a = store.createTask({
      title: 'A',
      dueDate: '2026-10-14',
      areaId: area('Home').id,
    }).result;
    const b = store.createTask({
      title: 'B',
      dueDate: '2026-10-14',
      areaId: area('Home').id,
    }).result;
    const c = store.createTask({
      title: 'C',
      block: { date: '2026-10-14', time: '15:00', minutes: 30 },
      areaId: area('Home').id,
    }).result;
    const d = store.createTask({
      title: 'D',
      dueDate: '2026-10-14',
      areaId: area('Home').id,
    }).result;
    store.completeTask(a.id); // Done after all
    store.rescheduleTask(b.id, '2026-10-15'); // Tomorrow
    store.rescheduleTask(c.id, '2026-10-16'); // Pick a day
    store.updateTask({ id: d.id, status: 'someday' }); // Someday
    expect(store.shutdown().unfinished).toEqual([]);
    const before = total();
    expect(store.completeShutdown().xp).toBe(10);
    expect(total()).toBe(before + 10);
    expect(store.shutdown().doneToday).toBe(true);
    expect(store.ritualState({ briefingEnabled: true }).shutdownDoneToday).toBe(true);
    // A second time the same day earns nothing more.
    expect(store.completeShutdown().xp).toBe(0);
    expect(total()).toBe(before + 10);
  });

  it('Shutdown Habit after 5 days of it', () => {
    for (let day = 14; day < 19; day++) {
      now = new Date(2026, 9, day, 15, 30);
      store.completeShutdown();
    }
    expect(
      store.getWins().achievements.find((a) => a.key === 'shutdown-habit')?.unlockedAt,
    ).not.toBeNull();
  });
});

describe('summary', () => {
  it("counts today's XP and wins, and ignores yesterday's", () => {
    now = new Date(2026, 9, 13, 10, 0);
    store.completeTask(store.createTask({ title: 'Yesterday', areaId: area('Home').id }).result.id);
    now = new Date(2026, 9, 14, 10, 0);
    store.completeTask(
      store.createTask({ title: 'Today', size: 'm', areaId: area('Home').id }).result.id,
    );
    const summary = store.getSummary();
    expect(summary).toMatchObject({ totalXp: 30, xpToday: 20, winsToday: 1 });
    const view = store.getWins();
    expect(view.week.at(-1)).toMatchObject({ date: '2026-10-14', wins: 1, xp: 20 });
    expect(view.week.at(-2)).toMatchObject({ date: '2026-10-13', wins: 1, xp: 10 });
    expect(view.recent.map((r) => r.date)).toEqual(['2026-10-13']);
  });
});
