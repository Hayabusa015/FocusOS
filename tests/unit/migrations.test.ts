import { mkdtempSync, existsSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { openDatabase } from '../../src/main/db/connection';
import type { Db } from '../../src/main/db/connection';
import { backupDatabase } from '../../src/main/db/backup';
import {
  bundledMigrations,
  DatabaseTooNewError,
  MigrationError,
  parseMigrationFiles,
  runMigrations,
} from '../../src/main/db/migrate';
import { SettingsStore } from '../../src/main/db/settings';
import { z } from 'zod';

const dirs: string[] = [];
const tmp = () => {
  const d = mkdtempSync(join(tmpdir(), 'cortex-test-'));
  dirs.push(d);
  return d;
};
// Every database file a test opens is tracked and closed before its folder is deleted: Windows
// refuses to delete a file that is still open (EPERM), which Linux allows. In-memory databases
// need no tracking.
const opened: Db[] = [];
const openFile = (path: string): Db => {
  const db = openDatabase(path);
  opened.push(db);
  return db;
};
afterEach(() => {
  for (const db of opened.splice(0)) {
    try {
      db.close();
    } catch {
      // Already closed by the test itself.
    }
  }
  for (const dir of dirs.splice(0)) {
    rmSync(dir, { recursive: true, force: true, maxRetries: 5, retryDelay: 100 });
  }
});

const m = (version: number, name: string, sql: string) => ({ version, name, sql });

describe('bundled migrations', () => {
  it('load in order with no gaps', () => {
    const all = bundledMigrations();
    expect(all.length).toBeGreaterThan(0);
    expect(all.map((x) => x.version)).toEqual(all.map((_, i) => i + 1));
  });

  it('apply to a fresh database and create the settings table', () => {
    const db = openDatabase(':memory:');
    const result = runMigrations(db);
    expect(result.from).toBe(0);
    expect(result.applied.length).toBe(bundledMigrations().length);
    const tables = db.prepare("SELECT name FROM sqlite_master WHERE type='table'").all() as {
      name: string;
    }[];
    expect(tables.map((t) => t.name)).toContain('settings');
  });

  it('are a no-op the second time', () => {
    const db = openDatabase(':memory:');
    runMigrations(db);
    expect(runMigrations(db)).toMatchObject({ applied: [], backupPath: null });
  });
});

describe('parseMigrationFiles', () => {
  it('rejects bad names and gaps', () => {
    expect(() => parseMigrationFiles({ './migrations/init.sql': '' })).toThrow(/NNN_name/);
    expect(() =>
      parseMigrationFiles({ './migrations/001_a.sql': '', './migrations/003_b.sql': '' }),
    ).toThrow(/no gaps/);
  });
  it('sorts by version', () => {
    const out = parseMigrationFiles({
      './migrations/002_b.sql': 'b',
      './migrations/001_a.sql': 'a',
    });
    expect(out.map((x) => x.name)).toEqual(['a', 'b']);
  });
});

describe('safety', () => {
  it('refuses a database from a newer app and leaves it untouched', () => {
    const db = openDatabase(':memory:');
    runMigrations(db, [m(1, 'a', 'CREATE TABLE a(x)'), m(2, 'b', 'CREATE TABLE b(x)')]);
    expect(() => runMigrations(db, [m(1, 'a', 'CREATE TABLE a(x)')])).toThrow(DatabaseTooNewError);
    const tables = db.prepare("SELECT name FROM sqlite_master WHERE name='b'").all();
    expect(tables).toHaveLength(1);
  });

  it('refuses when an applied migration was edited', () => {
    const db = openDatabase(':memory:');
    runMigrations(db, [m(1, 'a', 'CREATE TABLE a(x)')]);
    expect(() => runMigrations(db, [m(1, 'a', 'CREATE TABLE a(x, y)')])).toThrow(/was changed/);
  });

  it('rolls a failed migration back completely and names the backup', () => {
    const dir = tmp();
    const db = openFile(join(dir, 'cortex.db'));
    runMigrations(db, [m(1, 'a', 'CREATE TABLE keep(x); INSERT INTO keep VALUES (42)')]);

    const bad = [
      m(1, 'a', 'CREATE TABLE keep(x); INSERT INTO keep VALUES (42)'),
      m(2, 'broken', 'CREATE TABLE half(x); INSERT INTO nowhere VALUES (1)'),
    ];
    let caught: unknown;
    try {
      runMigrations(db, bad, { backupDir: join(dir, 'backups') });
    } catch (e) {
      caught = e;
    }
    expect(caught).toBeInstanceOf(MigrationError);
    const err = caught as MigrationError;
    expect(err.message).toContain('pre-migration-v1-to-v2.db');
    expect(existsSync(err.backupPath as string)).toBe(true);
    // The half-created table must not exist, and migration 2 must not be recorded.
    expect(db.prepare("SELECT name FROM sqlite_master WHERE name='half'").all()).toHaveLength(0);
    expect(db.prepare('SELECT MAX(version) v FROM schema_migrations').get()).toEqual({ v: 1 });
    // The backup holds the pre-migration data.
    const backup = openFile(err.backupPath as string);
    expect(backup.prepare('SELECT x FROM keep').get()).toEqual({ x: 42 });
  });

  it('takes no backup for a brand-new database', () => {
    const dir = tmp();
    const db = openFile(join(dir, 'cortex.db'));
    const result = runMigrations(db, [m(1, 'a', 'CREATE TABLE a(x)')], {
      backupDir: join(dir, 'b'),
    });
    expect(result.backupPath).toBeNull();
  });
});

describe('backupDatabase', () => {
  it('copies a WAL-mode database consistently and replaces an earlier backup', () => {
    const dir = tmp();
    const db = openFile(join(dir, 'cortex.db'));
    db.exec('CREATE TABLE t(x); INSERT INTO t VALUES (1)');
    const dest = join(dir, 'backups', 'one.db');
    backupDatabase(db, dest);
    db.exec('INSERT INTO t VALUES (2)');
    backupDatabase(db, dest);
    const copy = openFile(dest);
    expect(copy.prepare('SELECT COUNT(*) c FROM t').get()).toEqual({ c: 2 });
  });
});

describe('SQLite capabilities the plan depends on', () => {
  it('has FTS5 (PLAN §11A)', () => {
    const db = openDatabase(':memory:');
    db.exec('CREATE VIRTUAL TABLE docs USING fts5(title, body)');
    db.prepare('INSERT INTO docs VALUES (?, ?)').run('Lab', 'density of a syrup tray');
    expect(db.prepare("SELECT title FROM docs WHERE docs MATCH 'syrup'").all()).toHaveLength(1);
  });
});

describe('SettingsStore', () => {
  it('round-trips, validates and deletes', () => {
    const db = openDatabase(':memory:');
    runMigrations(db);
    const store = new SettingsStore(db, () => new Date('2026-10-14T12:00:00Z'));
    store.set('k', { a: 1 });
    expect(store.get('k', z.object({ a: z.number() }))).toEqual({ a: 1 });
    expect(store.get('k', z.object({ a: z.string() }))).toBeUndefined();
    store.set('k', { a: 2 });
    expect(store.get('k', z.object({ a: z.number() }))).toEqual({ a: 2 });
    store.delete('k');
    expect(store.get('k', z.unknown())).toBeUndefined();
  });
});
