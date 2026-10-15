import { z } from 'zod';
import { LocalDateSchema, TaskSize } from './core';

/**
 * Google (PLAN §9): shared shapes for the main process and the renderer. The renderer never sees a
 * token, a client secret or a message body; it sees the views below.
 */

/** The only calendar Cortex writes to (CLAUDE.md rule 7). */
export const CORTEX_CALENDAR_NAME = 'Cortex';

/**
 * What Cortex asks Google for. Reading other calendars is read-only, and the one write scope
 * (`calendar.app.created`) only reaches calendars Cortex itself created, so Google refuses a
 * write to any of the user's own calendars. (PLAN §9.2 listed `calendar.events`, which cannot
 * create the "Cortex" calendar; changed with the user's approval, 2026-10-15.)
 */
export const GOOGLE_SCOPES = [
  'https://www.googleapis.com/auth/calendar.app.created',
  'https://www.googleapis.com/auth/calendar.events.readonly',
  'https://www.googleapis.com/auth/calendar.calendarlist.readonly',
  'https://www.googleapis.com/auth/gmail.readonly',
] as const;

export const GoogleConnect = z.object({
  clientId: z.string().trim().min(10).max(300),
  clientSecret: z.string().trim().min(5).max(300),
});
export type GoogleConnect = z.infer<typeof GoogleConnect>;

export const GoogleCalendarChoice = z.object({
  ids: z.array(z.string().min(1).max(400)).max(100),
});

export const CalendarInfoView = z.object({
  id: z.string(),
  name: z.string(),
  primary: z.boolean(),
  selected: z.boolean(),
  /** The calendar Cortex writes time blocks to. It cannot be switched off or chosen. */
  isCortex: z.boolean(),
});
export type CalendarInfoView = z.infer<typeof CalendarInfoView>;

export const GoogleStatus = z.object({
  /** Whether a Google sign-in is saved. */
  connected: z.boolean(),
  /** The saved sign-in was refused by Google (revoked or expired): sign in again. */
  needsSignIn: z.boolean(),
  /** Whether this PC can keep the secrets safely (Windows' own key store). */
  canStoreSecrets: z.boolean(),
  clientId: z.string().nullable(),
  hasClientSecret: z.boolean(),
  account: z.string().nullable(),
  calendars: z.array(CalendarInfoView),
  calendar: z.object({
    state: z.enum(['off', 'ok', 'error']),
    lastSync: z.string().nullable(),
    error: z.string().nullable(),
  }),
  gmail: z.object({
    /** `unavailable` means Google refused the Gmail permission: Calendar still works (PLAN §9.1). */
    state: z.enum(['off', 'ok', 'unavailable', 'error']),
    lastRun: z.string().nullable(),
    error: z.string().nullable(),
    pending: z.number().int(),
  }),
});
export type GoogleStatus = z.infer<typeof GoogleStatus>;

export const GoogleOutcome = z.discriminatedUnion('ok', [
  z.object({ ok: z.literal(true), status: GoogleStatus }),
  z.object({ ok: z.literal(false), error: z.string(), status: GoogleStatus }),
]);
export type GoogleOutcome = z.infer<typeof GoogleOutcome>;

// --- Email suggestions (PLAN §9.4) ---------------------------------------------------------

export const EmailProposal = z.object({
  actionable: z.boolean(),
  /** Why Atlas thinks so, in a few words. */
  reason: z.string(),
  task: z
    .object({
      title: z.string(),
      dueDate: z.string().nullable(),
      areaId: z.string().nullable(),
      areaName: z.string().nullable(),
      size: TaskSize.nullable(),
    })
    .nullable(),
});
export type EmailProposal = z.infer<typeof EmailProposal>;

export const EmailSuggestionView = z.object({
  id: z.string(),
  from: z.string(),
  subject: z.string(),
  receivedAt: z.string(),
  proposal: EmailProposal,
});
export type EmailSuggestionView = z.infer<typeof EmailSuggestionView>;

/** Accept a suggestion, optionally with the user's edits to what Atlas proposed. */
export const EmailAccept = z.object({
  id: z.string().min(1).max(40),
  title: z.string().trim().min(1).max(300).optional(),
  dueDate: LocalDateSchema.nullable().optional(),
  areaId: z.string().min(1).max(40).nullable().optional(),
  size: TaskSize.optional(),
});
export type EmailAccept = z.infer<typeof EmailAccept>;

export const EmailDismiss = z.object({ id: z.string().min(1).max(40) });

export const EmailCheckResult = z.discriminatedUnion('ok', [
  z.object({ ok: z.literal(true), proposed: z.number().int(), skipped: z.number().int() }),
  z.object({ ok: z.literal(false), error: z.string() }),
]);
export type EmailCheckResult = z.infer<typeof EmailCheckResult>;
