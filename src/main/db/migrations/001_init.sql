-- Phase 0: the settings store. Everything the app remembers about itself that is not user data
-- (updater state, the last version that ran, and later the user's preferences).
-- Values are JSON text. Timestamps are UTC ISO-8601 (PLAN §6 conventions).
CREATE TABLE settings (
  key        TEXT PRIMARY KEY,
  value      TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  updated_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
);
