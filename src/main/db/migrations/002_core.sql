-- Phase 1: areas, tasks, home maintenance and the undo log (PLAN §6).
-- Dates are local YYYY-MM-DD text, times of day are local HH:MM text, and moments are UTC ISO-8601.

CREATE TABLE areas (
  id              TEXT PRIMARY KEY,
  name            TEXT NOT NULL,
  kind            TEXT NOT NULL CHECK (kind IN ('class', 'coaching', 'home', 'admin', 'personal')),
  color_token     TEXT NOT NULL,
  icon            TEXT,
  sort_order      INTEGER NOT NULL DEFAULT 0,
  archived_at     TEXT,
  workwork_course TEXT CHECK (workwork_course IS NULL OR workwork_course IN ('chemistry', 'physics', 'geology')),
  created_at      TEXT NOT NULL,
  updated_at      TEXT NOT NULL
);

CREATE TABLE tasks (
  id                TEXT PRIMARY KEY,
  title             TEXT NOT NULL,
  notes             TEXT,
  area_id           TEXT REFERENCES areas (id),
  parent_id         TEXT REFERENCES tasks (id),
  status            TEXT NOT NULL DEFAULT 'inbox' CHECK (status IN ('inbox', 'todo', 'doing', 'done', 'someday')),
  due_date          TEXT CHECK (due_date IS NULL OR due_date GLOB '[0-9][0-9][0-9][0-9]-[0-9][0-9]-[0-9][0-9]'),
  due_time          TEXT CHECK (due_time IS NULL OR due_time GLOB '[0-2][0-9]:[0-5][0-9]'),
  scheduled_start   TEXT,
  scheduled_minutes INTEGER CHECK (scheduled_minutes IS NULL OR scheduled_minutes > 0),
  size              TEXT NOT NULL DEFAULT 's' CHECK (size IN ('s', 'm', 'l')),
  unit_code         TEXT,
  note_path         TEXT,
  recurrence        TEXT,
  defer_count       INTEGER NOT NULL DEFAULT 0,
  source            TEXT NOT NULL DEFAULT 'manual' CHECK (source IN ('manual', 'voice', 'atlas', 'email', 'calendar')),
  source_ref        TEXT,
  completed_at      TEXT,
  deleted_at        TEXT,
  created_at        TEXT NOT NULL,
  updated_at        TEXT NOT NULL
);
CREATE INDEX tasks_area ON tasks (area_id);
CREATE INDEX tasks_parent ON tasks (parent_id);
CREATE INDEX tasks_due ON tasks (due_date);
CREATE INDEX tasks_status ON tasks (status);
CREATE INDEX tasks_scheduled ON tasks (scheduled_start);

CREATE TABLE maintenance_items (
  id            TEXT PRIMARY KEY,
  name          TEXT NOT NULL,
  area_id       TEXT REFERENCES areas (id),
  interval_days INTEGER NOT NULL CHECK (interval_days > 0),
  last_done     TEXT CHECK (last_done IS NULL OR last_done GLOB '[0-9][0-9][0-9][0-9]-[0-9][0-9]-[0-9][0-9]'),
  lead_days     INTEGER NOT NULL DEFAULT 7 CHECK (lead_days >= 0),
  notes         TEXT,
  deleted_at    TEXT,
  created_at    TEXT NOT NULL,
  updated_at    TEXT NOT NULL
);

CREATE TABLE maintenance_log (
  id         TEXT PRIMARY KEY,
  item_id    TEXT NOT NULL REFERENCES maintenance_items (id),
  done_on    TEXT NOT NULL,
  note       TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);
CREATE INDEX maintenance_log_item ON maintenance_log (item_id);

-- Every change is logged with its inverse, which is what Undo applies (PLAN §7.5).
CREATE TABLE action_log (
  id           TEXT PRIMARY KEY,
  actor        TEXT NOT NULL CHECK (actor IN ('user', 'atlas')),
  action       TEXT NOT NULL,
  payload_json TEXT NOT NULL,
  inverse_json TEXT NOT NULL,
  undone_at    TEXT,
  created_at   TEXT NOT NULL,
  updated_at   TEXT NOT NULL
);
CREATE INDEX action_log_created ON action_log (created_at);
