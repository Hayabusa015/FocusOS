-- Phase 3: Atlas. The transcript (one conversation per local day, append-only) and the cost ledger.

CREATE TABLE atlas_messages (
  id           TEXT PRIMARY KEY,
  day          TEXT NOT NULL CHECK (day GLOB '[0-9][0-9][0-9][0-9]-[0-9][0-9]-[0-9][0-9]'),
  role         TEXT NOT NULL CHECK (role IN ('user', 'assistant', 'system')),
  content_json TEXT NOT NULL,
  created_at   TEXT NOT NULL,
  updated_at   TEXT NOT NULL
);
CREATE INDEX atlas_messages_day ON atlas_messages (day, created_at);

CREATE TABLE api_usage (
  id                 TEXT PRIMARY KEY,
  route              TEXT NOT NULL,
  model              TEXT NOT NULL,
  input_tokens       INTEGER NOT NULL DEFAULT 0,
  output_tokens      INTEGER NOT NULL DEFAULT 0,
  cache_read_tokens  INTEGER NOT NULL DEFAULT 0,
  cache_write_tokens INTEGER NOT NULL DEFAULT 0,
  est_cost_usd       REAL NOT NULL DEFAULT 0,
  created_at         TEXT NOT NULL,
  updated_at         TEXT NOT NULL
);
CREATE INDEX api_usage_time ON api_usage (created_at);
