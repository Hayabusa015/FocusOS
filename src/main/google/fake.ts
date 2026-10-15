import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { CORTEX_CALENDAR_NAME } from '@shared/google';
import { PermissionDeniedError, SignInRequiredError } from './types';
import type {
  EventDraft,
  GoogleAuth,
  GoogleBackend,
  MailMeta,
  RemoteCalendar,
  RemoteEvent,
} from './types';

/**
 * A pretend Google, for tests (CLAUDE.md rule 6). Its whole state is one plain object, optionally
 * kept in a JSON file, so an end-to-end test can change "Google" from outside the app by editing
 * the file: move an event, add an email, switch Gmail off. Like the other fakes it is used only
 * in an unpackaged build with CORTEX_TEST_GOOGLE=fake (see index.ts).
 */
export interface FakeMail extends MailMeta {
  /** Gmail labels, for example `INBOX` or `CATEGORY_PROMOTIONS`. */
  labels: string[];
}

export interface FakeState {
  email: string;
  calendars: RemoteCalendar[];
  events: RemoteEvent[];
  mail: FakeMail[];
  /** Google refuses the Gmail permission (an unverified app, PLAN §9.1). */
  gmailDenied: boolean;
  /** Google refuses the saved sign-in. */
  signInRequired: boolean;
  /** Every write Cortex made, with the calendar it went to. Tests assert it is only "Cortex". */
  writes: { op: 'insert' | 'patch' | 'remove'; calendarId: string; eventId: string }[];
  /** Every Gmail call Cortex made, so a test can check no body was ever asked for. */
  mailCalls: { op: 'list' | 'meta'; id?: string }[];
  cortexCalendarId: string | null;
  seq: number;
}

export const emptyFakeState = (): FakeState => ({
  email: 'teacher@example.com',
  calendars: [
    { id: 'primary-cal', name: 'Personal', primary: true, accessRole: 'owner' },
    { id: 'family-cal', name: 'Family', primary: false, accessRole: 'owner' },
    { id: 'school-cal', name: 'Garfield staff', primary: false, accessRole: 'reader' },
  ],
  events: [],
  mail: [],
  gmailDenied: false,
  signInRequired: false,
  writes: [],
  mailCalls: [],
  cortexCalendarId: null,
  seq: 0,
});

export interface FakeGoogle {
  auth: GoogleAuth;
  state(): FakeState;
  /** For unit tests: change the state directly. */
  mutate(fn: (s: FakeState) => void): void;
}

export function createFakeGoogle(
  options: { path?: string; now?: () => Date; initial?: Partial<FakeState> } = {},
): FakeGoogle {
  const now = options.now ?? (() => new Date());
  let memory: FakeState = { ...emptyFakeState(), ...options.initial };

  const load = (): FakeState => {
    if (!options.path) return memory;
    if (!existsSync(options.path)) return memory;
    try {
      return JSON.parse(readFileSync(options.path, 'utf8')) as FakeState;
    } catch {
      return memory;
    }
  };
  const save = (s: FakeState) => {
    memory = s;
    if (options.path) writeFileSync(options.path, JSON.stringify(s, null, 2));
  };
  const use = <T>(fn: (s: FakeState) => T): T => {
    const s = load();
    const out = fn(s);
    save(s);
    return out;
  };
  const guard = (s: FakeState, area: 'calendar' | 'mail') => {
    if (s.signInRequired) throw new SignInRequiredError();
    if (area === 'mail' && s.gmailDenied) throw new PermissionDeniedError();
  };
  const stampOf = (s: FakeState) => {
    s.seq += 1;
    return { etag: `etag-${s.seq}`, updated: now().toISOString() };
  };
  const inWindow = (e: RemoteEvent, from: string, to: string) =>
    !e.cancelled && e.start < to && e.end > from;

  const backend = (): GoogleBackend => ({
    profile: async () => use((s) => (guard(s, 'calendar'), { email: s.email })),
    calendars: {
      listCalendars: async () =>
        use((s) => {
          guard(s, 'calendar');
          return [...s.calendars];
        }),
      listEvents: async (calendarId, from, to) =>
        use((s) => {
          guard(s, 'calendar');
          return s.events.filter((e) => e.calendarId === calendarId && inWindow(e, from, to));
        }),
    },
    cortex: {
      ensure: async () =>
        use((s) => {
          guard(s, 'calendar');
          if (!s.cortexCalendarId) {
            s.cortexCalendarId = 'cortex-cal';
            s.calendars.push({
              id: 'cortex-cal',
              name: CORTEX_CALENDAR_NAME,
              primary: false,
              accessRole: 'owner',
            });
          }
          return s.cortexCalendarId;
        }),
      list: async (from, to) =>
        use((s) => {
          guard(s, 'calendar');
          return s.events.filter(
            (e) => e.calendarId === s.cortexCalendarId && inWindow(e, from, to),
          );
        }),
      get: async (eventId) =>
        use((s) => {
          guard(s, 'calendar');
          const e = s.events.find((x) => x.id === eventId && x.calendarId === s.cortexCalendarId);
          return e && !e.cancelled ? e : null;
        }),
      insert: async (d: EventDraft) =>
        use((s) => {
          guard(s, 'calendar');
          const calendarId = s.cortexCalendarId ?? 'cortex-cal';
          s.cortexCalendarId = calendarId;
          const event: RemoteEvent = {
            id: `evt-${s.seq + 1}`,
            calendarId,
            title: d.title,
            start: d.start,
            end: d.end,
            allDay: false,
            cortexTaskId: d.cortexTaskId,
            cancelled: false,
            ...stampOf(s),
          };
          s.events.push(event);
          s.writes.push({ op: 'insert', calendarId, eventId: event.id });
          return event;
        }),
      patch: async (eventId, d) =>
        use((s) => {
          guard(s, 'calendar');
          const event = s.events.find(
            (e) => e.id === eventId && e.calendarId === s.cortexCalendarId,
          );
          if (!event) throw new Error('That event is not in the Cortex calendar.');
          Object.assign(event, {
            title: d.title,
            start: d.start,
            end: d.end,
            allDay: false,
            cortexTaskId: d.cortexTaskId,
            ...stampOf(s),
          });
          s.writes.push({ op: 'patch', calendarId: event.calendarId, eventId });
          return event;
        }),
      remove: async (eventId) =>
        use((s) => {
          guard(s, 'calendar');
          const i = s.events.findIndex(
            (e) => e.id === eventId && e.calendarId === s.cortexCalendarId,
          );
          if (i === -1) return;
          s.writes.push({ op: 'remove', calendarId: s.events[i]!.calendarId, eventId });
          s.events.splice(i, 1);
        }),
    },
    mail: {
      listInbox: async (afterMs, max) =>
        use((s) => {
          guard(s, 'mail');
          s.mailCalls.push({ op: 'list' });
          return s.mail
            .filter(
              (m) =>
                m.labels.includes('INBOX') &&
                !m.labels.some((l) =>
                  ['CATEGORY_PROMOTIONS', 'CATEGORY_SOCIAL', 'CATEGORY_UPDATES'].includes(l),
                ) &&
                new Date(m.date).getTime() > afterMs,
            )
            .sort((a, b) => b.date.localeCompare(a.date))
            .slice(0, max)
            .map((m) => m.id);
        }),
      getMeta: async (id) =>
        use((s) => {
          guard(s, 'mail');
          s.mailCalls.push({ op: 'meta', id });
          const m = s.mail.find((x) => x.id === id);
          if (!m) throw new Error('No such message.');
          const { labels: _labels, ...meta } = m;
          return meta;
        }),
    },
  });

  const auth: GoogleAuth = {
    authorize: async () => {
      use((s) => {
        s.signInRequired = false;
      });
      return { refreshToken: 'fake-refresh-token' };
    },
    revoke: async () => undefined,
    backend,
  };

  return {
    auth,
    state: () => load(),
    mutate: (fn) => use((s) => fn(s)),
  };
}
