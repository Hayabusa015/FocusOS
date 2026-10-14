import { mkdirSync } from 'node:fs';
import { dirname } from 'node:path';
import { DatabaseSync } from 'node:sqlite';

/**
 * The only file that knows which SQLite binding Cortex uses.
 *
 * Phase 0 spike result (recorded in PLAN §0): Node's built-in `node:sqlite` works in Electron
 * 44.3.0's main process (Node 24, SQLite 3.53) with FTS5 and transactional DDL, so there is no
 * native module to rebuild. If that ever stops being true, only this file changes.
 */
export type Db = DatabaseSync;

export function openDatabase(path: string): Db {
  if (path !== ':memory:') mkdirSync(dirname(path), { recursive: true });
  const db = new DatabaseSync(path);
  db.exec(`
    PRAGMA journal_mode = WAL;
    PRAGMA foreign_keys = ON;
    PRAGMA busy_timeout = 5000;
    PRAGMA synchronous = NORMAL;
  `);
  return db;
}
