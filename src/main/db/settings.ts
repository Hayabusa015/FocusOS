import type { z } from 'zod';
import type { Db } from './connection';

/** The small key/value store behind the updater state and, later, user preferences. */
export interface KeyValueStore {
  get<S extends z.ZodType>(key: string, schema: S): z.infer<S> | undefined;
  set(key: string, value: unknown): void;
  delete(key: string): void;
}

export class SettingsStore implements KeyValueStore {
  constructor(
    private readonly db: Db,
    private readonly now: () => Date = () => new Date(),
  ) {}

  get<S extends z.ZodType>(key: string, schema: S): z.infer<S> | undefined {
    const row = this.db.prepare('SELECT value FROM settings WHERE key = ?').get(key) as
      { value: string } | undefined;
    if (!row) return undefined;
    try {
      const parsed = schema.safeParse(JSON.parse(row.value));
      return parsed.success ? parsed.data : undefined;
    } catch {
      return undefined;
    }
  }

  set(key: string, value: unknown): void {
    const stamp = this.now().toISOString();
    this.db
      .prepare(
        `INSERT INTO settings (key, value, created_at, updated_at) VALUES (?, ?, ?, ?)
         ON CONFLICT(key) DO UPDATE SET value = excluded.value, updated_at = excluded.updated_at`,
      )
      .run(key, JSON.stringify(value), stamp, stamp);
  }

  delete(key: string): void {
    this.db.prepare('DELETE FROM settings WHERE key = ?').run(key);
  }
}
