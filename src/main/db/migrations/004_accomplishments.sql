-- Phase 2: XP, wins, achievements and focus sessions (PLAN §6).

-- The XP ledger. Totals are always summed from here and never cached. Undoing a completion adds
-- a negative event; rows are never deleted.
CREATE TABLE xp_events (
  id          TEXT PRIMARY KEY,
  kind        TEXT NOT NULL CHECK (kind IN ('task', 'maintenance', 'focus', 'inbox-zero', 'shutdown')),
  ref_id      TEXT NOT NULL,
  points      INTEGER NOT NULL CHECK (points != 0),
  area_id     TEXT REFERENCES areas (id),
  occurred_at TEXT NOT NULL,
  created_at  TEXT NOT NULL,
  updated_at  TEXT NOT NULL
);
CREATE INDEX xp_events_ref ON xp_events (kind, ref_id);
CREATE INDEX xp_events_time ON xp_events (occurred_at);

-- Wins: a finished task writes one automatically, and you can log your own.
-- A win goes away (deleted_at) when the thing it records is undone.
CREATE TABLE wins (
  id          TEXT PRIMARY KEY,
  text        TEXT NOT NULL,
  occurred_at TEXT NOT NULL,
  ref_id      TEXT,
  deleted_at  TEXT,
  created_at  TEXT NOT NULL,
  updated_at  TEXT NOT NULL
);
CREATE INDEX wins_time ON wins (occurred_at);
CREATE INDEX wins_ref ON wins (ref_id);

-- Achievement definitions live in code (domain/achievements.ts); only the unlocks are stored.
CREATE TABLE achievements_unlocked (
  id              TEXT PRIMARY KEY,
  achievement_key TEXT NOT NULL UNIQUE,
  unlocked_at     TEXT NOT NULL,
  created_at      TEXT NOT NULL,
  updated_at      TEXT NOT NULL
);

CREATE TABLE focus_sessions (
  id              TEXT PRIMARY KEY,
  area_id         TEXT REFERENCES areas (id),
  task_id         TEXT REFERENCES tasks (id),
  planned_minutes INTEGER NOT NULL CHECK (planned_minutes > 0),
  started_at      TEXT NOT NULL,
  ended_at        TEXT,
  completed       INTEGER NOT NULL DEFAULT 0 CHECK (completed IN (0, 1)),
  created_at      TEXT NOT NULL,
  updated_at      TEXT NOT NULL
);
CREATE INDEX focus_sessions_started ON focus_sessions (started_at);
