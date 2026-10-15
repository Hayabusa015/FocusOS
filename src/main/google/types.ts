/**
 * The seam between Cortex and Google (CLAUDE.md rule 6): everything the app needs from Google is
 * in these interfaces, so every default test runs against an in-memory fake.
 *
 * Writing is deliberately narrow (rule 7): the only calendar that can be written to is "Cortex",
 * and `CortexCalendar` takes no calendar id from its callers.
 */

export interface RemoteCalendar {
  id: string;
  name: string;
  primary: boolean;
  /** `owner`, `writer`, `reader` or `freeBusyReader`. */
  accessRole: string;
}

export interface RemoteEvent {
  id: string;
  calendarId: string;
  title: string;
  /** A UTC instant, or a local date (YYYY-MM-DD) for an all-day event. */
  start: string;
  end: string;
  allDay: boolean;
  etag: string;
  /** When Google last changed the event (a UTC instant). */
  updated: string;
  /** From `extendedProperties.private.cortexTaskId`. */
  cortexTaskId: string | null;
  cancelled: boolean;
}

export interface EventDraft {
  title: string;
  start: string;
  end: string;
  cortexTaskId: string;
}

export interface CalendarReader {
  listCalendars(): Promise<RemoteCalendar[]>;
  /** Events overlapping [fromIso, toIso). Cancelled events are not returned. */
  listEvents(calendarId: string, fromIso: string, toIso: string): Promise<RemoteEvent[]>;
}

/** The "Cortex" calendar, the only one Cortex writes to. */
export interface CortexCalendar {
  /** Finds or creates the calendar and returns its id. */
  ensure(): Promise<string>;
  list(fromIso: string, toIso: string): Promise<RemoteEvent[]>;
  /** One event by id, wherever it now sits in time. Null when it is gone. */
  get(eventId: string): Promise<RemoteEvent | null>;
  insert(draft: EventDraft): Promise<RemoteEvent>;
  patch(eventId: string, draft: EventDraft): Promise<RemoteEvent>;
  remove(eventId: string): Promise<void>;
}

export interface MailMeta {
  id: string;
  from: string;
  subject: string;
  /** A UTC instant. */
  date: string;
  /** Gmail's own snippet, about 200 characters. Bodies and attachments are never fetched. */
  snippet: string;
}

export interface MailReader {
  /** Ids of inbox messages newer than `afterMs`, outside Promotions, Social and Updates. */
  listInbox(afterMs: number, max: number): Promise<string[]>;
  getMeta(id: string): Promise<MailMeta>;
}

export interface GoogleBackend {
  profile(): Promise<{ email: string }>;
  calendars: CalendarReader;
  cortex: CortexCalendar;
  mail: MailReader;
}

/** Google refused the saved sign-in (revoked, expired, or the client was deleted). */
export class SignInRequiredError extends Error {
  constructor(message = 'Google needs you to sign in again.') {
    super(message);
    this.name = 'SignInRequiredError';
  }
}

/** Google refused one permission (for example Gmail for an unverified app). */
export class PermissionDeniedError extends Error {
  constructor(message = 'Google refused that permission.') {
    super(message);
    this.name = 'PermissionDeniedError';
  }
}

export interface Tokens {
  refreshToken: string;
}

/** Signing in, signing out, and turning a saved sign-in into a working backend. */
export interface GoogleAuth {
  authorize(client: { clientId: string; clientSecret: string }): Promise<Tokens>;
  revoke(client: { clientId: string; clientSecret: string }, tokens: Tokens): Promise<void>;
  backend(client: { clientId: string; clientSecret: string }, tokens: Tokens): GoogleBackend;
}
