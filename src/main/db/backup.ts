import { mkdirSync, rmSync } from 'node:fs';
import { dirname } from 'node:path';
import type { Db } from './connection';

/**
 * Writes a consistent copy of the live database to `destPath` with `VACUUM INTO`.
 * That is safe while the database is in WAL mode (a plain file copy is not). An existing file
 * at `destPath` is replaced, since backups here are named for the event they protect.
 */
export function backupDatabase(db: Db, destPath: string): string {
  mkdirSync(dirname(destPath), { recursive: true });
  rmSync(destPath, { force: true });
  db.prepare('VACUUM INTO ?').run(destPath);
  return destPath;
}
