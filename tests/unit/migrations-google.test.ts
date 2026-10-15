import { afterEach, describe, expect, it } from 'vitest';
import { openDatabase } from '../../src/main/db/connection';
import type { Db } from '../../src/main/db/connection';
import { bundledMigrations, runMigrations } from '../../src/main/db/migrate';

let db: Db | null = null;
afterEach(() => {
  db?.close();
  db = null;
});

const stamp = '2026-10-15T12:00:00.000Z';
const event = (id: string, calendar = 'cal', google = 'g1') =>
  `INSERT INTO calendar_events (id, google_id, calendar_id, title, start, "end", synced_at, created_at, updated_at)
   VALUES ('${id}', '${google}', '${calendar}', 'Dentist', '${stamp}', '${stamp}', '${stamp}', '${stamp}', '${stamp}')`;
const suggestion = (id: string, message: string, status = 'pending') =>
  `INSERT INTO email_suggestions (id, gmail_message_id, "from", subject, received_at, proposed_json, status, created_at, updated_at)
   VALUES ('${id}', '${message}', 'a@b.c', 'Hi', '${stamp}', '{}', '${status}', '${stamp}', '${stamp}')`;

describe('migration 006: Google', () => {
  it('applies on top of an existing database and leaves earlier data alone', () => {
    db = openDatabase(':memory:');
    runMigrations(
      db,
      bundledMigrations().filter((m) => m.version <= 5),
    );
    db.exec(
      `INSERT INTO tasks (id, title, created_at, updated_at) VALUES ('t1', 'Keep me', '${stamp}', '${stamp}')`,
    );
    const result = runMigrations(db);
    expect(result.applied).toEqual([6]);
    expect(db.prepare("SELECT title FROM tasks WHERE id = 't1'").get()).toEqual({
      title: 'Keep me',
    });
  });

  it('caches one row per calendar and Google event id', () => {
    db = openDatabase(':memory:');
    runMigrations(db);
    db.exec(event('a'));
    expect(() => db!.exec(event('b'))).toThrow(/UNIQUE/);
    db.exec(event('c', 'other-cal')); // The same event id in another calendar is fine.
    expect(db.prepare('SELECT COUNT(*) AS n FROM calendar_events').get()).toEqual({ n: 2 });
  });

  it('never proposes a message twice, and only knows the four statuses', () => {
    db = openDatabase(':memory:');
    runMigrations(db);
    db.exec(suggestion('s1', 'm1'));
    expect(() => db!.exec(suggestion('s2', 'm1'))).toThrow(/UNIQUE/);
    expect(() => db!.exec(suggestion('s3', 'm3', 'sent'))).toThrow(/CHECK/);
    for (const status of ['accepted', 'dismissed', 'not_actionable']) {
      db.exec(suggestion(`ok-${status}`, `m-${status}`, status));
    }
  });

  it('has no column that could hold a message body', () => {
    db = openDatabase(':memory:');
    runMigrations(db);
    const columns = (
      db.prepare('PRAGMA table_info(email_suggestions)').all() as { name: string }[]
    ).map((c) => c.name);
    expect(columns.sort()).toEqual(
      [
        'created_at',
        'decided_at',
        'from',
        'gmail_message_id',
        'id',
        'proposed_json',
        'received_at',
        'status',
        'subject',
        'updated_at',
      ].sort(),
    );
  });
});
