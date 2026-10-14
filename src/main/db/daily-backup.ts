import { existsSync, mkdirSync, readdirSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import type { LocalDate } from '@shared/dates';
import { backupDatabase } from './backup';
import type { Db } from './connection';

/**
 * A copy of the database on the first open each day, keeping the last 14 (PLAN §12). The
 * pre-update and pre-migration backups have their own names and are never pruned here.
 */
export const KEEP_DAILY_BACKUPS = 14;
const NAME = /^daily-(\d{4}-\d{2}-\d{2})\.db$/;

export interface BackupInfo {
  /** Newest first. */
  dates: LocalDate[];
}

export function listDailyBackups(dir: string): BackupInfo {
  if (!existsSync(dir)) return { dates: [] };
  const dates = readdirSync(dir)
    .map((name) => NAME.exec(name)?.[1])
    .filter((d): d is string => Boolean(d))
    .sort()
    .reverse();
  return { dates };
}

export function ensureDailyBackup(
  db: Db,
  dir: string,
  today: LocalDate,
  keep: number = KEEP_DAILY_BACKUPS,
): { created: boolean; pruned: number } {
  mkdirSync(dir, { recursive: true });
  const target = join(dir, `daily-${today}.db`);
  const created = !existsSync(target);
  if (created) backupDatabase(db, target);

  const { dates } = listDailyBackups(dir);
  const surplus = dates.slice(keep);
  for (const date of surplus) rmSync(join(dir, `daily-${date}.db`), { force: true });
  return { created, pruned: surplus.length };
}
