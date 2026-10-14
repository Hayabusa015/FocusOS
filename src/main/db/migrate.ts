import { createHash } from 'node:crypto';
import { join } from 'node:path';
import type { Db } from './connection';
import { backupDatabase } from './backup';

export interface Migration {
  version: number;
  name: string;
  sql: string;
}

/** The database was written by a newer Cortex than this one. It is never opened or rewritten. */
export class DatabaseTooNewError extends Error {
  constructor(
    readonly databaseVersion: number,
    readonly appVersion: number,
  ) {
    super(
      `This data was saved by a newer version of Cortex (schema ${databaseVersion}); ` +
        `this version only understands schema ${appVersion}. Install the latest Cortex. ` +
        'Your data has not been changed.',
    );
    this.name = 'DatabaseTooNewError';
  }
}

/** A migration failed. It was rolled back, so nothing is half-applied. */
export class MigrationError extends Error {
  constructor(
    readonly migration: Migration,
    readonly backupPath: string | null,
    cause: unknown,
  ) {
    const reason = cause instanceof Error ? cause.message : String(cause);
    super(
      `Migration ${String(migration.version).padStart(3, '0')}_${migration.name} failed: ${reason}. ` +
        (backupPath
          ? `Your data from before the update is saved at ${backupPath}.`
          : 'No earlier data existed to back up.'),
    );
    this.name = 'MigrationError';
  }
}

const FILE_PATTERN = /(?:^|\/)(\d{3,})_([a-z0-9_]+)\.sql$/;

export function parseMigrationFiles(files: Record<string, string>): Migration[] {
  const migrations = Object.entries(files).map(([path, sql]) => {
    const m = FILE_PATTERN.exec(path.replaceAll('\\', '/'));
    if (!m) throw new Error(`Migration file "${path}" must be named NNN_name.sql`);
    return { version: Number(m[1]), name: m[2] as string, sql };
  });
  migrations.sort((a, b) => a.version - b.version);
  migrations.forEach((m, i) => {
    if (m.version !== i + 1) {
      throw new Error(
        `Migration versions must run 1, 2, 3 with no gaps; found ${m.version} at position ${i + 1}`,
      );
    }
  });
  return migrations;
}

/** The migrations bundled with the app. Vite inlines the SQL text at build time. */
export function bundledMigrations(): Migration[] {
  return parseMigrationFiles(
    import.meta.glob('./migrations/*.sql', { query: '?raw', import: 'default', eager: true }),
  );
}

const checksum = (sql: string) => createHash('sha256').update(sql).digest('hex');

export interface MigrateOptions {
  /** Where to put the pre-migration backup when pending migrations meet an existing database. */
  backupDir?: string;
  now?: () => Date;
}

export interface MigrateResult {
  from: number;
  to: number;
  applied: number[];
  backupPath: string | null;
}

export function runMigrations(
  db: Db,
  migrations: Migration[] = bundledMigrations(),
  options: MigrateOptions = {},
): MigrateResult {
  db.exec(`
    CREATE TABLE IF NOT EXISTS schema_migrations (
      version    INTEGER PRIMARY KEY,
      name       TEXT NOT NULL,
      checksum   TEXT NOT NULL,
      applied_at TEXT NOT NULL
    )
  `);

  const applied = db
    .prepare('SELECT version, name, checksum FROM schema_migrations ORDER BY version')
    .all() as { version: number; name: string; checksum: string }[];
  const current = applied.at(-1)?.version ?? 0;
  const latest = migrations.at(-1)?.version ?? 0;

  if (current > latest) throw new DatabaseTooNewError(current, latest);

  // An applied migration must still match the file it came from.
  for (const row of applied) {
    const known = migrations.find((m) => m.version === row.version);
    if (!known || known.name !== row.name || checksum(known.sql) !== row.checksum) {
      throw new Error(
        `Migration ${row.version}_${row.name} was changed after it was applied. ` +
          'Applied migrations are never edited; add a new one instead.',
      );
    }
  }

  const pending = migrations.filter((m) => m.version > current);
  if (pending.length === 0) return { from: current, to: current, applied: [], backupPath: null };

  const now = options.now ?? (() => new Date());
  let backupPath: string | null = null;
  if (current > 0 && options.backupDir) {
    backupPath = backupDatabase(
      db,
      join(options.backupDir, `pre-migration-v${current}-to-v${latest}.db`),
    );
  }

  const done: number[] = [];
  for (const migration of pending) {
    db.exec('BEGIN IMMEDIATE');
    try {
      db.exec(migration.sql);
      db.prepare(
        'INSERT INTO schema_migrations (version, name, checksum, applied_at) VALUES (?, ?, ?, ?)',
      ).run(migration.version, migration.name, checksum(migration.sql), now().toISOString());
      db.exec('COMMIT');
      done.push(migration.version);
    } catch (error) {
      db.exec('ROLLBACK');
      throw new MigrationError(migration, backupPath, error);
    }
  }
  return { from: current, to: latest, applied: done, backupPath };
}
