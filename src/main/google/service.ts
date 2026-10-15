import { z } from 'zod';
import type { AppSettings, CalendarEventView } from '@shared/core';
import { addDays, isoToLocalDate, isoToLocalTime, localToIso } from '@shared/dates';
import type {
  CalendarInfoView,
  EmailAccept,
  EmailCheckResult,
  EmailSuggestionView,
  GoogleConnect,
  GoogleOutcome,
  GoogleStatus,
} from '@shared/google';
import { EmailProposal } from '@shared/google';
import type { AtlasDeps } from '../atlas/engine';
import {
  countPendingSuggestions,
  decideSuggestion,
  deleteEvent,
  deleteEventsOutside,
  deleteUnseen,
  getSuggestion,
  insertSuggestion,
  knownMessageIds,
  listCachedEvents,
  listEventsOn,
  listPendingSuggestions,
  reopenSuggestion,
  taskUpdatedAt,
  upsertEvent,
} from '../db/google';
import type { KeyValueStore } from '../db/settings';
import type { Store } from '../db/store';
import { planCortexSync } from './cortex-sync';
import type { BlockTask, Mirror } from './cortex-sync';
import type { GoogleSecrets } from './secrets';
import { triageMessages } from './triage';
import { PermissionDeniedError, SignInRequiredError } from './types';
import type { GoogleAuth, GoogleBackend, RemoteEvent } from './types';

const WINDOW_DAYS = 14;
/** Atlas reads this many messages per request, and at most this many per check. */
const EMAIL_BATCH = 25;
const MAX_EMAIL_PER_CHECK = 100;
const FIRST_RUN_LOOKBACK_MS = 3 * 24 * 3600_000;

export interface GoogleServiceDeps {
  store: Store;
  kv: KeyValueStore;
  secrets: GoogleSecrets;
  auth: GoogleAuth;
  settings: () => AppSettings;
  /** Atlas, for triage only: it reads four fields of each message and changes nothing. */
  atlas: AtlasDeps;
  /** Tells every window that events or suggestions changed. */
  notifyChanged: () => void;
  log: (message: string) => void;
  /** Called after the Cortex calendar id is known, so the real client can reuse it. */
  rememberCortexCalendar?: (id: string) => void;
}

const K = {
  clientId: 'google.clientId',
  account: 'google.account',
  calendars: 'google.calendars',
  selected: 'google.selected',
  cortexId: 'google.cortexCalendarId',
  lastSync: 'google.calendar.lastSync',
  calendarError: 'google.calendar.error',
  needsSignIn: 'google.needsSignIn',
  gmailState: 'google.gmail.state',
  gmailError: 'google.gmail.error',
  gmailLastRun: 'google.gmail.lastRun',
} as const;

const KnownCalendars = z.array(
  z.object({ id: z.string(), name: z.string(), primary: z.boolean() }),
);
const Strings = z.array(z.string());

/** The message a person can act on. Google's own wording never reaches the screen unexplained. */
const plain = (error: unknown): string =>
  error instanceof Error ? error.message : 'Something went wrong talking to Google.';

/**
 * Everything Cortex does with Google (PLAN §9), in one object for the IPC layer. Every method is
 * safe to call when Google is not connected: it returns quietly and the rest of the app does not
 * notice (CLAUDE.md rule 6). Only the "Cortex" calendar is ever written to (rule 7), and email is
 * only ever read (never sent), as metadata and a snippet (never a body).
 */
export function createGoogleService(deps: GoogleServiceDeps) {
  const { store, kv, secrets } = deps;
  const ctx = store.ctx;
  let cached: { token: string; backend: GoogleBackend } | null = null;
  let queue: Promise<unknown> = Promise.resolve();
  let blockSignature = '';
  let debounce: NodeJS.Timeout | null = null;

  /** Runs one thing at a time, so a sync, a sign-in and an email check never trip over each other. */
  const exclusive = <T>(fn: () => Promise<T>): Promise<T> => {
    const next = queue.then(fn, fn);
    queue = next.catch(() => undefined);
    return next;
  };

  const clientId = (): string | null => kv.get(K.clientId, z.string()) ?? null;
  const connected = (): boolean =>
    Boolean(clientId() && secrets.clientSecret() && secrets.refreshToken());

  const backend = (): GoogleBackend | null => {
    const id = clientId();
    const secret = secrets.clientSecret();
    const token = secrets.refreshToken();
    if (!id || !secret || !token) return null;
    if (cached?.token !== token) {
      cached = {
        token,
        backend: deps.auth.backend({ clientId: id, clientSecret: secret }, { refreshToken: token }),
      };
    }
    return cached.backend;
  };

  const knownCalendars = () => kv.get(K.calendars, KnownCalendars) ?? [];
  const cortexId = (): string | null => kv.get(K.cortexId, z.string()) ?? null;
  const selectedIds = (): string[] => kv.get(K.selected, Strings) ?? [];

  const calendarNames = (): Map<string, string> =>
    new Map(knownCalendars().map((c) => [c.id, c.name]));

  function status(): GoogleStatus {
    const isConnected = connected();
    const wanted = new Set(selectedIds());
    const cortex = cortexId();
    const calendars: CalendarInfoView[] = isConnected
      ? knownCalendars().map((c) => ({
          id: c.id,
          name: c.name,
          primary: c.primary,
          selected: c.id === cortex || wanted.has(c.id),
          isCortex: c.id === cortex,
        }))
      : [];
    const calendarError = kv.get(K.calendarError, z.string()) ?? null;
    const gmailState = kv.get(K.gmailState, z.enum(['ok', 'unavailable', 'error']));
    const lastRun = kv.get(K.gmailLastRun, z.number());
    return {
      connected: isConnected,
      needsSignIn: kv.get(K.needsSignIn, z.boolean()) ?? false,
      canStoreSecrets: secrets.available(),
      clientId: clientId(),
      hasClientSecret: secrets.clientSecret() !== null,
      account: isConnected ? (kv.get(K.account, z.string()) ?? null) : null,
      calendars,
      calendar: {
        state:
          !isConnected || !deps.settings().googleCalendar ? 'off' : calendarError ? 'error' : 'ok',
        lastSync: kv.get(K.lastSync, z.string()) ?? null,
        error: calendarError,
      },
      gmail: {
        state: !isConnected || !deps.settings().googleEmailTriage ? 'off' : (gmailState ?? 'ok'),
        lastRun: lastRun ? new Date(lastRun).toISOString() : null,
        error: kv.get(K.gmailError, z.string()) ?? null,
        pending: isConnected ? countPendingSuggestions(ctx) : 0,
      },
    };
  }

  const ok = (): GoogleOutcome => ({ ok: true, status: status() });
  const fail = (error: unknown): GoogleOutcome => ({
    ok: false,
    error: plain(error),
    status: status(),
  });

  /** Remembers that Google refused the saved sign-in, so Settings can offer "Sign in again". */
  function noteFailure(error: unknown, area: 'calendar' | 'mail'): void {
    if (error instanceof SignInRequiredError) {
      kv.set(K.needsSignIn, true);
      return;
    }
    if (area === 'calendar') kv.set(K.calendarError, plain(error));
    else if (error instanceof PermissionDeniedError) {
      kv.set(K.gmailState, 'unavailable');
      kv.set(K.gmailError, 'Google did not allow Cortex to read Gmail. Calendar still works.');
    } else {
      kv.set(K.gmailState, 'error');
      kv.set(K.gmailError, plain(error));
    }
  }

  const inTransaction = <T>(fn: () => T): T => {
    ctx.db.exec('BEGIN');
    try {
      const out = fn();
      ctx.db.exec('COMMIT');
      return out;
    } catch (error) {
      ctx.db.exec('ROLLBACK');
      throw error;
    }
  };

  // --- Calendar ---------------------------------------------------------------------------

  const window = () => {
    const today = ctx.today();
    return {
      from: localToIso(today, '00:00'),
      to: localToIso(addDays(today, WINDOW_DAYS), '00:00'),
    };
  };

  /** Pulls the chosen calendars into the cache: the next 14 days, nothing else. */
  async function readCalendars(b: GoogleBackend): Promise<void> {
    const found = await b.calendars.listCalendars();
    const cortex = cortexId();
    kv.set(
      K.calendars,
      found.map((c) => ({ id: c.id, name: c.name, primary: c.primary })),
    );
    // A calendar that was deleted in Google drops out of the choice.
    const exists = new Set(found.map((c) => c.id));
    const selected = selectedIds().filter((id) => exists.has(id) && id !== cortex);
    kv.set(K.selected, selected);
    const { from, to } = window();
    const stamp = ctx.nowIso();
    const fetched = new Map<string, RemoteEvent[]>();
    for (const id of selected) fetched.set(id, await b.calendars.listEvents(id, from, to));
    inTransaction(() => {
      for (const [id, events] of fetched) {
        for (const e of events) upsertEvent(ctx, e, stamp);
        deleteUnseen(
          ctx,
          id,
          events.map((e) => e.id),
          from,
          to,
        );
      }
      deleteEventsOutside(ctx, [...selected, ...(cortex ? [cortex] : [])]);
    });
  }

  const blockTasks = (): BlockTask[] => {
    const updated = taskUpdatedAt(ctx);
    return store.listWithBlocks().map((t) => ({
      id: t.id,
      title: t.title,
      status: t.status,
      startIso: t.scheduledStart as string,
      minutes: t.scheduledMinutes as number,
      updatedAt: updated.get(t.id) ?? t.createdAt,
    }));
  };

  const signatureOf = (tasks: BlockTask[]) =>
    tasks.map((t) => `${t.id}|${t.startIso}|${t.minutes}|${t.title}|${t.status}`).join('\n');

  /** Brings the "Cortex" calendar and the tasks' time blocks in step, in both directions. */
  async function reconcile(b: GoogleBackend): Promise<{ changed: boolean }> {
    let calendarId = cortexId();
    if (!calendarId) {
      calendarId = await b.cortex.ensure();
      kv.set(K.cortexId, calendarId);
      deps.rememberCortexCalendar?.(calendarId);
    }
    const readAt = ctx.nowIso(); // Before the tasks are read: an edit after this counts as newer.
    const tasks = blockTasks();
    blockSignature = signatureOf(tasks);

    const today = ctx.today();
    const starts = tasks.map((t) => new Date(t.startIso).getTime());
    const ends = tasks.map((t) => new Date(t.startIso).getTime() + t.minutes * 60_000);
    const from = new Date(
      Math.min(new Date(localToIso(addDays(today, -1), '00:00')).getTime(), ...starts) - 86_400_000,
    ).toISOString();
    const to = new Date(
      Math.max(new Date(localToIso(addDays(today, WINDOW_DAYS), '00:00')).getTime(), ...ends) +
        86_400_000,
    ).toISOString();
    const remote = await b.cortex.list(from, to);

    const mirrors = new Map<string, Mirror>();
    for (const row of listCachedEvents(ctx, calendarId)) {
      if (row.cortexTaskId)
        mirrors.set(row.cortexTaskId, {
          googleId: row.googleId,
          etag: row.etag,
          syncedAt: row.syncedAt,
        });
    }
    // An event moved far outside the window is not in the list, but it is not deleted either:
    // ask for it by id before deciding anything. (A failed lookup stops the sync; nothing is
    // cleared on a guess.)
    const listed = new Set(remote.map((e) => e.id));
    const wantedTasks = new Set(tasks.map((t) => t.id));
    for (const [taskId, m] of mirrors) {
      if (listed.has(m.googleId) || !wantedTasks.has(taskId)) continue;
      const found = await b.cortex.get(m.googleId);
      if (found) remote.push(found);
    }
    const plan = planCortexSync({ tasks, mirrors, remote });

    const seen = new Map(remote.map((e) => [e.id, e]));
    let changed = false;
    const errors: unknown[] = [];
    // Events whose change did not go through keep their old record, so the next try sees the same
    // difference and decides the same way, instead of mistaking Google's move for old news.
    const failed = new Set<string>();
    const eventOfTask = new Map(
      remote.flatMap((e) => (e.cortexTaskId ? [[e.cortexTaskId, e.id]] : [])),
    );
    const attempt = async (fn: () => Promise<void> | void, eventId?: string) => {
      try {
        await fn();
      } catch (error) {
        if (error instanceof SignInRequiredError) throw error;
        errors.push(error);
        if (eventId) failed.add(eventId);
      }
    };

    for (const r of plan.remove) {
      await attempt(async () => {
        await b.cortex.remove(r.eventId);
        seen.delete(r.eventId);
        deleteEvent(ctx, calendarId, r.eventId);
      });
    }
    for (const r of plan.insert) {
      await attempt(async () => {
        const made = await b.cortex.insert(r.draft);
        seen.set(made.id, made);
      });
    }
    for (const r of plan.patch) {
      await attempt(async () => {
        const made = await b.cortex.patch(r.eventId, r.draft);
        seen.set(made.id, made);
      }, r.eventId);
    }
    for (const r of plan.pull) {
      await attempt(() => {
        store.updateTask({
          id: r.taskId,
          block: {
            date: isoToLocalDate(r.startIso),
            time: isoToLocalTime(r.startIso),
            minutes: r.minutes,
          },
        });
        changed = true;
      }, eventOfTask.get(r.taskId));
    }
    for (const r of plan.clearBlock) {
      await attempt(() => {
        store.updateTask({ id: r.taskId, block: null });
        changed = true;
      });
    }
    for (const r of plan.dropRows) deleteEvent(ctx, calendarId, r.googleId);

    // The cache now says what Google says, as of the moment the tasks were read.
    inTransaction(() => {
      for (const e of seen.values()) if (!failed.has(e.id)) upsertEvent(ctx, e, readAt);
      deleteUnseen(ctx, calendarId, [...seen.keys()], from, to);
    });
    if (errors.length > 0) throw errors[0];
    blockSignature = signatureOf(blockTasks());
    return { changed };
  }

  /** The whole calendar side: read the chosen calendars, then reconcile the Cortex calendar. */
  async function doSync(): Promise<GoogleOutcome> {
    const b = backend();
    if (!b) return ok();
    if (!deps.settings().googleCalendar) return ok();
    // The two halves do not depend on each other: one calendar that cannot be read must not stop
    // the time blocks from being mirrored, or a move in Google from coming back.
    const problems: unknown[] = [];
    for (const half of [readCalendars, reconcile]) {
      try {
        await half(b);
      } catch (error) {
        if (error instanceof SignInRequiredError) {
          problems.unshift(error);
          break;
        }
        problems.push(error);
      }
    }
    if (problems.length === 0) {
      kv.delete(K.calendarError);
      kv.delete(K.needsSignIn);
      kv.set(K.lastSync, ctx.nowIso());
      deps.notifyChanged();
      return ok();
    }
    noteFailure(problems[0], 'calendar');
    deps.log(`Google Calendar sync failed: ${plain(problems[0])}`);
    deps.notifyChanged();
    return fail(problems[0]);
  }
  const syncNow = (): Promise<GoogleOutcome> => exclusive(doSync);

  /**
   * A task's time block changed in Cortex: mirror it soon. Cheap when nothing about the blocks
   * changed, so it is safe to call after every change.
   */
  function afterLocalChange(): void {
    if (!connected() || !deps.settings().googleCalendar) return;
    if (signatureOf(blockTasks()) === blockSignature) return;
    if (debounce) clearTimeout(debounce);
    debounce = setTimeout(() => {
      debounce = null;
      void exclusive(async () => {
        const b = backend();
        if (!b) return;
        try {
          const { changed } = await reconcile(b);
          kv.delete(K.calendarError);
          if (changed) deps.notifyChanged();
        } catch (error) {
          noteFailure(error, 'calendar');
          deps.log(`Google Calendar update failed: ${plain(error)}`);
        }
      });
    }, 1500);
  }

  function eventsToday(): CalendarEventView[] {
    if (!connected() || !deps.settings().googleCalendar) return [];
    return listEventsOn(ctx, ctx.today(), calendarNames());
  }

  // --- Sign-in ----------------------------------------------------------------------------

  async function signIn(client: GoogleConnect): Promise<GoogleOutcome> {
    if (!secrets.available()) {
      return fail(
        new Error('This PC cannot keep a Google sign-in safely, so Cortex will not save one.'),
      );
    }
    const before = {
      clientId: clientId(),
      clientSecret: secrets.clientSecret(),
      refreshToken: secrets.refreshToken(),
      cortexId: cortexId(),
    };
    try {
      kv.set(K.clientId, client.clientId);
      secrets.setClientSecret(client.clientSecret);
      const tokens = await deps.auth.authorize(client);
      secrets.setRefreshToken(tokens.refreshToken);
      cached = null;
      // A new sign-in finds (or makes) its own Cortex calendar; it never inherits the id of
      // whichever account was connected before.
      kv.delete(K.cortexId);
      const b = backend() as GoogleBackend;

      const me = await b.profile();
      kv.set(K.account, me.email);
      const found = await b.calendars.listCalendars();
      kv.set(
        K.calendars,
        found.map((c) => ({ id: c.id, name: c.name, primary: c.primary })),
      );
      // First time: show the main calendar. A later sign-in keeps the choice already made.
      if (kv.get(K.selected, Strings) === undefined) {
        kv.set(
          K.selected,
          found.filter((c) => c.primary).map((c) => c.id),
        );
      }
      const cortex = await b.cortex.ensure();
      kv.set(K.cortexId, cortex);
      deps.rememberCortexCalendar?.(cortex);
      // Is the restricted Gmail permission accepted? Recorded either way (PLAN §9.1).
      try {
        await b.mail.listInbox(Date.now(), 1);
        kv.set(K.gmailState, 'ok');
        kv.delete(K.gmailError);
      } catch (error) {
        if (error instanceof SignInRequiredError) throw error;
        noteFailure(error, 'mail');
      }
      kv.delete(K.needsSignIn);
      kv.delete(K.calendarError);
    } catch (error) {
      // A sign-in that did not finish leaves things as they were: a working sign-in survives a
      // cancelled attempt to sign in again, and a first attempt leaves nothing half-saved.
      cached = null;
      if (before.refreshToken && before.clientId && before.clientSecret) {
        kv.set(K.clientId, before.clientId);
        secrets.setClientSecret(before.clientSecret);
        secrets.setRefreshToken(before.refreshToken);
        if (before.cortexId) kv.set(K.cortexId, before.cortexId);
      } else {
        secrets.clearRefreshToken();
      }
      return fail(error);
    }
    return doSync();
  }

  async function disconnect(): Promise<GoogleStatus> {
    const id = clientId();
    const secret = secrets.clientSecret();
    const token = secrets.refreshToken();
    if (id && secret && token)
      await deps.auth.revoke({ clientId: id, clientSecret: secret }, { refreshToken: token });
    secrets.clear();
    cached = null;
    // The sign-in, the calendar choice and every cached event go. Decisions already made about
    // emails stay (a message is never proposed twice), and the "Cortex" calendar in Google is left
    // alone: it is the user's data.
    for (const key of Object.values(K)) kv.delete(key);
    inTransaction(() => deleteEventsOutside(ctx, []));
    deps.notifyChanged();
    return status();
  }

  function setCalendars(ids: string[]): Promise<GoogleOutcome> {
    const cortex = cortexId();
    const known = new Set(knownCalendars().map((c) => c.id));
    kv.set(
      K.selected,
      ids.filter((id) => known.has(id) && id !== cortex),
    );
    return syncNow();
  }

  // --- Email ------------------------------------------------------------------------------

  const asView = (row: ReturnType<typeof getSuggestion>): EmailSuggestionView | null => {
    if (!row) return null;
    let proposal: EmailProposal;
    try {
      proposal = EmailProposal.parse(JSON.parse(row.proposedJson));
    } catch {
      return null;
    }
    // An area renamed or archived since the proposal no longer applies.
    const areas = store.listAreas();
    if (proposal.task?.areaId && !areas.some((a) => a.id === proposal.task?.areaId)) {
      proposal = { ...proposal, task: { ...proposal.task, areaId: null, areaName: null } };
    }
    return {
      id: row.id,
      from: row.from,
      subject: row.subject,
      receivedAt: row.receivedAt,
      proposal,
    };
  };

  function suggestions(): EmailSuggestionView[] {
    if (!connected()) return [];
    return listPendingSuggestions(ctx)
      .map((r) => asView(r))
      .filter((v): v is EmailSuggestionView => v !== null);
  }

  /** `manual` is the "Check email" button: it explains what is missing instead of staying quiet. */
  function checkEmail(manual: boolean): Promise<EmailCheckResult> {
    return exclusive(async (): Promise<EmailCheckResult> => {
      const b = backend();
      const quiet = (error: string): EmailCheckResult => ({ ok: false, error });
      if (!b) return quiet('Google is not connected.');
      if (!deps.settings().googleEmailTriage) return quiet('Email suggestions are switched off.');
      if (!deps.atlas.secrets.get()) {
        return quiet('Email suggestions need your Atlas key. Add it in Settings.');
      }
      if (!manual && kv.get(K.gmailState, z.string()) === 'unavailable')
        return quiet('Gmail is not available.');
      try {
        const now = ctx.now().getTime();
        const last = kv.get(K.gmailLastRun, z.number()) ?? now - FIRST_RUN_LOOKBACK_MS;
        // A minute of overlap, so a message that arrived while the last run was working is not missed.
        const ids = await b.mail.listInbox(last - 60_000, MAX_EMAIL_PER_CHECK);
        const known = knownMessageIds(ctx, ids);
        const fresh = ids.filter((id) => !known.has(id));
        let proposed = 0;
        // Atlas sees a few dozen at a time. Each batch is saved before the next is asked for, so a
        // failure part-way keeps what was done and the rest are tried again next time.
        for (let at = 0; at < fresh.length; at += EMAIL_BATCH) {
          const metas = [];
          for (const id of fresh.slice(at, at + EMAIL_BATCH)) metas.push(await b.mail.getMeta(id));
          const proposals = await triageMessages(deps.atlas, metas);
          const byId = new Map(metas.map((m) => [m.id, m]));
          inTransaction(() => {
            for (const p of proposals) {
              const m = byId.get(p.messageId);
              if (!m) continue;
              const proposal = EmailProposal.parse({
                actionable: p.actionable,
                reason: p.reason,
                task: p.task,
              });
              // Only these four things are kept: sender, subject, date, and the proposal.
              insertSuggestion(ctx, {
                gmailMessageId: m.id,
                from: m.from,
                subject: m.subject,
                receivedAt: m.date,
                proposedJson: JSON.stringify(proposal),
                status: p.actionable ? 'pending' : 'not_actionable',
              });
            }
          });
          proposed += proposals.filter((p) => p.actionable).length;
        }
        kv.set(K.gmailLastRun, now);
        kv.set(K.gmailState, 'ok');
        kv.delete(K.gmailError);
        if (proposed > 0) deps.notifyChanged();
        return { ok: true, proposed, skipped: ids.length - fresh.length };
      } catch (error) {
        noteFailure(error, 'mail');
        deps.log(
          `Email check failed: ${error instanceof PermissionDeniedError ? 'Gmail refused' : plain(error)}`,
        );
        return { ok: false, error: plain(error) };
      }
    });
  }

  function accept(input: EmailAccept): { ok: true; taskId: string } | { ok: false; error: string } {
    const row = getSuggestion(ctx, input.id);
    if (!row || row.status !== 'pending')
      return { ok: false, error: 'That suggestion was already handled.' };
    const view = asView(row);
    const proposed = view?.proposal.task;
    const title = input.title ?? proposed?.title;
    if (!title) return { ok: false, error: 'Give the task a title first.' };
    if (!decideSuggestion(ctx, input.id, 'accepted')) {
      return { ok: false, error: 'That suggestion was already handled.' };
    }
    try {
      const areaId = input.areaId !== undefined ? input.areaId : (proposed?.areaId ?? null);
      const dueDate = input.dueDate !== undefined ? input.dueDate : (proposed?.dueDate ?? null);
      const size = input.size ?? proposed?.size ?? undefined;
      const made = store.createTask(
        { title, areaId, dueDate, ...(size ? { size } : {}) },
        'email',
        row.gmailMessageId,
      );
      deps.notifyChanged();
      return { ok: true, taskId: made.result.id };
    } catch (error) {
      reopenSuggestion(ctx, input.id);
      return { ok: false, error: plain(error) };
    }
  }

  function dismiss(id: string): boolean {
    const done = decideSuggestion(ctx, id, 'dismissed');
    if (done) deps.notifyChanged();
    return done;
  }

  return {
    status,
    connect: (client: GoogleConnect) => exclusive(() => signIn(client)),
    /** Sign in again with the client already saved (after Google refused the old sign-in). */
    reconnect: (): Promise<GoogleOutcome> => {
      const id = clientId();
      const secret = secrets.clientSecret();
      if (!id || !secret) {
        return Promise.resolve(fail(new Error('Enter your client ID and secret first.')));
      }
      return exclusive(() => signIn({ clientId: id, clientSecret: secret }));
    },
    disconnect: () => exclusive(disconnect),
    setCalendars,
    syncNow,
    afterLocalChange,
    eventsToday,
    checkEmail,
    suggestions,
    accept,
    dismiss,
    stop: () => {
      if (debounce) clearTimeout(debounce);
    },
  };
}
export type GoogleService = ReturnType<typeof createGoogleService>;
