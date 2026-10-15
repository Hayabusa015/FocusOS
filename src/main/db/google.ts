import type { CalendarEventView } from '@shared/core';
import { addDays, localToIso } from '@shared/dates';
import type { LocalDate } from '@shared/dates';
import type { RemoteEvent } from '../google/types';
import { all, int, one, run, str, strOrNull } from './context';
import type { Ctx, Row } from './context';

/**
 * The Google caches and records (PLAN §6, §9). None of these tables is undoable and none of them
 * is the source of anything: the events are a copy of what Google said, and a suggestion is only
 * a proposal until the user accepts it.
 */

// --- Calendar events -----------------------------------------------------------------------

export interface CachedEvent {
  id: string;
  googleId: string;
  calendarId: string;
  title: string;
  start: string;
  end: string;
  allDay: boolean;
  etag: string | null;
  cortexTaskId: string | null;
  syncedAt: string;
}

const toCached = (r: Row): CachedEvent => ({
  id: str(r, 'id'),
  googleId: str(r, 'google_id'),
  calendarId: str(r, 'calendar_id'),
  title: str(r, 'title'),
  start: str(r, 'start'),
  end: str(r, 'end'),
  allDay: int(r, 'all_day') === 1,
  etag: strOrNull(r, 'etag'),
  cortexTaskId: strOrNull(r, 'cortex_task_id'),
  syncedAt: str(r, 'synced_at'),
});

export function upsertEvent(ctx: Ctx, e: RemoteEvent, syncedAt: string): void {
  const stamp = ctx.nowIso();
  run(
    ctx,
    `INSERT INTO calendar_events (id, google_id, calendar_id, title, start, "end", all_day, etag,
       cortex_task_id, synced_at, created_at, updated_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
     ON CONFLICT (calendar_id, google_id) DO UPDATE SET title = excluded.title,
       start = excluded.start, "end" = excluded."end", all_day = excluded.all_day,
       etag = excluded.etag, cortex_task_id = excluded.cortex_task_id,
       synced_at = excluded.synced_at, updated_at = excluded.updated_at`,
    ctx.newId(),
    e.id,
    e.calendarId,
    e.title,
    e.start,
    e.end,
    e.allDay ? 1 : 0,
    e.etag,
    e.cortexTaskId,
    syncedAt,
    stamp,
    stamp,
  );
}

export function deleteEvent(ctx: Ctx, calendarId: string, googleId: string): void {
  run(
    ctx,
    'DELETE FROM calendar_events WHERE calendar_id = ? AND google_id = ?',
    calendarId,
    googleId,
  );
}

/** Forget every cached event except those of the calendars still wanted (or all, with none). */
export function deleteEventsOutside(ctx: Ctx, keepCalendarIds: string[]): void {
  if (keepCalendarIds.length === 0) {
    run(ctx, 'DELETE FROM calendar_events');
    return;
  }
  const marks = keepCalendarIds.map(() => '?').join(', ');
  run(ctx, `DELETE FROM calendar_events WHERE calendar_id NOT IN (${marks})`, ...keepCalendarIds);
}

/** Drops cached events of one calendar that start in the window but were not seen this time. */
export function deleteUnseen(
  ctx: Ctx,
  calendarId: string,
  seenGoogleIds: string[],
  fromIso: string,
  toIso: string,
): void {
  const rows = all(
    ctx,
    'SELECT google_id FROM calendar_events WHERE calendar_id = ? AND start >= ? AND start < ?',
    calendarId,
    fromIso,
    toIso,
  );
  const seen = new Set(seenGoogleIds);
  for (const r of rows) {
    if (!seen.has(str(r, 'google_id'))) deleteEvent(ctx, calendarId, str(r, 'google_id'));
  }
}

export function listCachedEvents(ctx: Ctx, calendarId: string): CachedEvent[] {
  return all(
    ctx,
    'SELECT * FROM calendar_events WHERE calendar_id = ? ORDER BY start',
    calendarId,
  ).map(toCached);
}

/** Events that overlap a local day, for the Today view. Cortex's own mirrored blocks are left out. */
export function listEventsOn(
  ctx: Ctx,
  date: LocalDate,
  calendarNames: Map<string, string>,
): CalendarEventView[] {
  const from = localToIso(date, '00:00');
  const to = localToIso(addDays(date, 1), '00:00');
  const rows = all(
    ctx,
    `SELECT * FROM calendar_events WHERE cortex_task_id IS NULL AND (
       (all_day = 0 AND start < ? AND "end" > ?)
       OR (all_day = 1 AND start <= ? AND "end" > ?)
     ) ORDER BY all_day DESC, start, id`,
    to,
    from,
    date,
    date,
  );
  return rows.map(toCached).map((e) => ({
    id: e.id,
    calendarId: e.calendarId,
    calendarName: calendarNames.get(e.calendarId) ?? '',
    title: e.title,
    start: e.start,
    end: e.end,
    allDay: e.allDay,
  }));
}

// --- Email suggestions ---------------------------------------------------------------------

export type SuggestionStatus = 'pending' | 'accepted' | 'dismissed' | 'not_actionable';

export interface SuggestionRow {
  id: string;
  gmailMessageId: string;
  from: string;
  subject: string;
  receivedAt: string;
  proposedJson: string;
  status: SuggestionStatus;
}

const toSuggestion = (r: Row): SuggestionRow => ({
  id: str(r, 'id'),
  gmailMessageId: str(r, 'gmail_message_id'),
  from: str(r, 'from'),
  subject: str(r, 'subject'),
  receivedAt: str(r, 'received_at'),
  proposedJson: str(r, 'proposed_json'),
  status: str(r, 'status') as SuggestionStatus,
});

/** Which of these message ids were ever decided or proposed: they are never proposed again. */
export function knownMessageIds(ctx: Ctx, ids: string[]): Set<string> {
  if (ids.length === 0) return new Set();
  const marks = ids.map(() => '?').join(', ');
  return new Set(
    all(
      ctx,
      `SELECT gmail_message_id FROM email_suggestions WHERE gmail_message_id IN (${marks})`,
      ...ids,
    ).map((r) => str(r, 'gmail_message_id')),
  );
}

export function insertSuggestion(
  ctx: Ctx,
  s: Omit<SuggestionRow, 'id'> & { decidedAt?: string | null },
): void {
  const stamp = ctx.nowIso();
  run(
    ctx,
    `INSERT OR IGNORE INTO email_suggestions (id, gmail_message_id, "from", subject, received_at,
       proposed_json, status, decided_at, created_at, updated_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    ctx.newId(),
    s.gmailMessageId,
    s.from,
    s.subject,
    s.receivedAt,
    s.proposedJson,
    s.status,
    s.status === 'not_actionable' ? stamp : null,
    stamp,
    stamp,
  );
}

export function listPendingSuggestions(ctx: Ctx): SuggestionRow[] {
  return all(
    ctx,
    `SELECT * FROM email_suggestions WHERE status = 'pending' ORDER BY received_at DESC, id`,
  ).map(toSuggestion);
}

export function countPendingSuggestions(ctx: Ctx): number {
  return int(
    one(ctx, `SELECT COUNT(*) AS n FROM email_suggestions WHERE status = 'pending'`) ?? {},
    'n',
  );
}

export function getSuggestion(ctx: Ctx, id: string): SuggestionRow | null {
  const r = one(ctx, 'SELECT * FROM email_suggestions WHERE id = ?', id);
  return r ? toSuggestion(r) : null;
}

/** Decides a pending suggestion. False when it was already decided (so a double click does nothing). */
export function decideSuggestion(ctx: Ctx, id: string, status: 'accepted' | 'dismissed'): boolean {
  const stamp = ctx.nowIso();
  const result = ctx.db
    .prepare(
      `UPDATE email_suggestions SET status = ?, decided_at = ?, updated_at = ? WHERE id = ? AND status = 'pending'`,
    )
    .run(status, stamp, stamp, id);
  return Number(result.changes) > 0;
}

/** Puts a suggestion back to pending, after the task it was meant to create could not be made. */
export function reopenSuggestion(ctx: Ctx, id: string): void {
  run(
    ctx,
    `UPDATE email_suggestions SET status = 'pending', decided_at = NULL, updated_at = ? WHERE id = ?`,
    ctx.nowIso(),
    id,
  );
}

/** When each task last changed in Cortex (for "the newer side wins", PLAN §9.3). */
export function taskUpdatedAt(ctx: Ctx): Map<string, string> {
  return new Map(
    all(ctx, 'SELECT id, updated_at FROM tasks WHERE scheduled_start IS NOT NULL').map((r) => [
      str(r, 'id'),
      str(r, 'updated_at'),
    ]),
  );
}
