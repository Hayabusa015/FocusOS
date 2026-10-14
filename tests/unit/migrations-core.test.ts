import { afterEach, describe, expect, it } from 'vitest';
import { openDatabase } from '../../src/main/db/connection';
import type { Db } from '../../src/main/db/connection';
import { bundledMigrations, runMigrations } from '../../src/main/db/migrate';

let db: Db | null = null;
afterEach(() => {
  db?.close();
  db = null;
});

const stamp = '2026-10-14T12:00:00.000Z';
const task = (id: string) =>
  `INSERT INTO tasks (id, title, created_at, updated_at) VALUES ('${id}', 'T ${id}', '${stamp}', '${stamp}')`;

describe('migration 003: manual task order', () => {
  it('gives tasks that already exist an order that matches the order they were made in', () => {
    db = openDatabase(':memory:');
    runMigrations(
      db,
      bundledMigrations().filter((m) => m.version <= 2),
    );
    for (const id of ['01A', '01B', '01C']) db.exec(task(id));

    runMigrations(db);
    const rows = db.prepare('SELECT id FROM tasks ORDER BY sort_order').all() as { id: string }[];
    expect(rows.map((r) => r.id)).toEqual(['01A', '01B', '01C']);
    const orders = db.prepare('SELECT sort_order FROM tasks').all() as { sort_order: number }[];
    expect(new Set(orders.map((o) => o.sort_order)).size).toBe(3);
  });

  it('adds the column with a default for tasks made later', () => {
    db = openDatabase(':memory:');
    runMigrations(db);
    db.exec(task('01D'));
    expect(db.prepare("SELECT sort_order FROM tasks WHERE id = '01D'").get()).toEqual({
      sort_order: 0,
    });
  });
});

describe('migration 004: accomplishments', () => {
  const setup = () => {
    db = openDatabase(':memory:');
    runMigrations(db);
    return db;
  };
  const xp = (kind: string, points: number) =>
    `INSERT INTO xp_events (id, kind, ref_id, points, occurred_at, created_at, updated_at)
     VALUES ('e${Math.random()}', '${kind}', 'r', ${points}, '${stamp}', '${stamp}', '${stamp}')`;

  it('creates the tables', () => {
    const names = (
      setup().prepare("SELECT name FROM sqlite_master WHERE type = 'table'").all() as {
        name: string;
      }[]
    ).map((r) => r.name);
    for (const t of ['xp_events', 'wins', 'achievements_unlocked', 'focus_sessions']) {
      expect(names).toContain(t);
    }
  });

  it('keeps the ledger honest: known kinds only, and no zero-point rows', () => {
    const d = setup();
    expect(() => d.exec(xp('task', 10))).not.toThrow();
    expect(() => d.exec(xp('task', -10))).not.toThrow();
    expect(() => d.exec(xp('task', 0))).toThrow();
    expect(() => d.exec(xp('bonus', 5))).toThrow();
  });

  it('unlocks an achievement only once', () => {
    const d = setup();
    const insert = (id: string) =>
      d.exec(`INSERT INTO achievements_unlocked (id, achievement_key, unlocked_at, created_at, updated_at)
              VALUES ('${id}', 'first-capture', '${stamp}', '${stamp}', '${stamp}')`);
    insert('a1');
    expect(() => insert('a2')).toThrow();
  });

  it('rejects a focus session with no length', () => {
    const d = setup();
    expect(() =>
      d.exec(`INSERT INTO focus_sessions (id, planned_minutes, started_at, created_at, updated_at)
              VALUES ('f1', 0, '${stamp}', '${stamp}', '${stamp}')`),
    ).toThrow();
  });
});
