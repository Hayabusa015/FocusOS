-- Phase 5: Google Calendar and Gmail (PLAN §6, §9). Both tables are caches or proposal records;
-- the app works fully with them empty. Message bodies are never stored.

-- A cache of Google events. For the "Cortex" calendar, cortex_task_id links an event to the task
-- whose time block it mirrors, so the next sync can tell what changed on which side.
CREATE TABLE calendar_events (
  id             TEXT PRIMARY KEY,
  google_id      TEXT NOT NULL,
  calendar_id    TEXT NOT NULL,
  title          TEXT NOT NULL,
  start          TEXT NOT NULL,
  "end"          TEXT NOT NULL,
  all_day        INTEGER NOT NULL DEFAULT 0 CHECK (all_day IN (0, 1)),
  etag           TEXT,
  cortex_task_id TEXT,
  synced_at      TEXT NOT NULL,
  created_at     TEXT NOT NULL,
  updated_at     TEXT NOT NULL,
  UNIQUE (calendar_id, google_id)
);
CREATE INDEX calendar_events_time ON calendar_events (start, "end");
CREATE INDEX calendar_events_task ON calendar_events (cortex_task_id);

-- What Atlas proposed for each inbox message. Only sender, subject, date and the proposal are
-- kept. A message id is unique, so it is never proposed twice.
CREATE TABLE email_suggestions (
  id               TEXT PRIMARY KEY,
  gmail_message_id TEXT NOT NULL UNIQUE,
  "from"           TEXT NOT NULL,
  subject          TEXT NOT NULL,
  received_at      TEXT NOT NULL,
  proposed_json    TEXT NOT NULL,
  status           TEXT NOT NULL CHECK (status IN ('pending', 'accepted', 'dismissed', 'not_actionable')),
  decided_at       TEXT,
  created_at       TEXT NOT NULL,
  updated_at       TEXT NOT NULL
);
CREATE INDEX email_suggestions_status ON email_suggestions (status, received_at);
