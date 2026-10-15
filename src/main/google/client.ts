import { calendar } from '@googleapis/calendar';
import type { calendar_v3 } from '@googleapis/calendar';
import { gmail } from '@googleapis/gmail';
import { CodeChallengeMethod, OAuth2Client } from 'google-auth-library';
import { CORTEX_CALENDAR_NAME, GOOGLE_SCOPES } from '@shared/google';
import { runLoopbackSignIn } from './oauth';
import { PermissionDeniedError, SignInRequiredError } from './types';
import type {
  EventDraft,
  GoogleAuth,
  GoogleBackend,
  MailMeta,
  RemoteCalendar,
  RemoteEvent,
  Tokens,
} from './types';

interface Client {
  clientId: string;
  clientSecret: string;
}

/** Where the backend remembers which calendar is "Cortex" (a setting, not a secret). */
export interface CalendarIdStore {
  get(): string | null;
  set(id: string): void;
}

const statusOf = (e: unknown): number | null => {
  const x = e as { status?: unknown; code?: unknown; response?: { status?: unknown } };
  for (const v of [x?.status, x?.response?.status, x?.code]) {
    const n = typeof v === 'string' ? Number(v) : v;
    if (typeof n === 'number' && Number.isFinite(n)) return n;
  }
  return null;
};
const reasonOf = (e: unknown): string => {
  const x = e as { message?: string; response?: { data?: { error?: unknown } } };
  const data = x?.response?.data?.error;
  const text = typeof data === 'string' ? data : JSON.stringify(data ?? '');
  return `${x?.message ?? ''} ${text}`.toLowerCase();
};

/** Turns Google's errors into the few Cortex knows how to explain. */
export function mapGoogleError(error: unknown, area: 'calendar' | 'mail' | 'sign-in'): Error {
  const status = statusOf(error);
  const why = reasonOf(error);
  if (why.includes('invalid_grant') || status === 401) return new SignInRequiredError();
  if (why.includes('invalid_client') || why.includes('unauthorized_client')) {
    return new Error(
      'Google does not recognise that client ID and secret. Check them against the Google Cloud console.',
    );
  }
  if (why.includes('accessnotconfigured') || why.includes('has not been used in project')) {
    return new Error(
      `Google says the ${area === 'mail' ? 'Gmail' : 'Calendar'} API is not switched on for your project. ` +
        'Enable it in the Google Cloud console (docs/GOOGLE_SETUP.md, step 1).',
    );
  }
  if (status === 403) {
    if (area === 'mail') return new PermissionDeniedError('Google refused the Gmail permission.');
    return new Error(
      'Google refused that Calendar request. If a calendar named "Cortex" already existed before Cortex ' +
        'connected, rename or delete it in Google Calendar and connect again.',
    );
  }
  if (status === 429 || (status !== null && status >= 500)) {
    return new Error('Google is busy right now. Cortex will try again in a few minutes.');
  }
  return error instanceof Error ? error : new Error(String(error));
}

const isoOf = (t: calendar_v3.Schema$EventDateTime | undefined | null): string | null => {
  if (!t) return null;
  if (t.dateTime) return new Date(t.dateTime).toISOString();
  return t.date ?? null;
};

function toRemoteEvent(calendarId: string, e: calendar_v3.Schema$Event): RemoteEvent | null {
  const start = isoOf(e.start);
  const end = isoOf(e.end);
  if (!e.id || !start || !end || e.status === 'cancelled') return null;
  return {
    id: e.id,
    calendarId,
    title: e.summary?.trim() || '(no title)',
    start,
    end,
    allDay: Boolean(e.start?.date && !e.start?.dateTime),
    etag: e.etag ?? '',
    updated: e.updated ? new Date(e.updated).toISOString() : new Date(0).toISOString(),
    cortexTaskId: e.extendedProperties?.private?.['cortexTaskId'] ?? null,
    cancelled: false,
  };
}

export function createGoogleBackend(
  client: Client,
  tokens: Tokens,
  calendarId: CalendarIdStore,
): GoogleBackend {
  const auth = new OAuth2Client(client.clientId, client.clientSecret);
  auth.setCredentials({ refresh_token: tokens.refreshToken });
  const cal = calendar({ version: 'v3', auth });
  const mail = gmail({ version: 'v1', auth });
  const run = async <T>(area: 'calendar' | 'mail', fn: () => Promise<T>): Promise<T> => {
    try {
      return await fn();
    } catch (error) {
      throw mapGoogleError(error, area);
    }
  };

  const listCalendars = (): Promise<RemoteCalendar[]> =>
    run('calendar', async () => {
      const out: RemoteCalendar[] = [];
      let pageToken: string | undefined;
      do {
        const res = await cal.calendarList.list({
          maxResults: 250,
          ...(pageToken ? { pageToken } : {}),
        });
        for (const c of res.data.items ?? []) {
          if (!c.id) continue;
          out.push({
            id: c.id,
            name: c.summaryOverride ?? c.summary ?? c.id,
            primary: Boolean(c.primary),
            accessRole: c.accessRole ?? 'reader',
          });
        }
        pageToken = res.data.nextPageToken ?? undefined;
      } while (pageToken);
      return out;
    });

  const listEvents = (id: string, fromIso: string, toIso: string): Promise<RemoteEvent[]> =>
    run('calendar', async () => {
      const out: RemoteEvent[] = [];
      let pageToken: string | undefined;
      do {
        const res = await cal.events.list({
          calendarId: id,
          timeMin: fromIso,
          timeMax: toIso,
          singleEvents: true,
          orderBy: 'startTime',
          maxResults: 250,
          ...(pageToken ? { pageToken } : {}),
        });
        for (const e of res.data.items ?? []) {
          const mapped = toRemoteEvent(id, e);
          if (mapped) out.push(mapped);
        }
        pageToken = res.data.nextPageToken ?? undefined;
      } while (pageToken);
      return out;
    });

  let cortexId: string | null = calendarId.get();
  const ensure = (): Promise<string> =>
    run('calendar', async () => {
      if (cortexId) return cortexId;
      const all = await listCalendars();
      const existing = all.find((c) => c.name === CORTEX_CALENDAR_NAME && c.accessRole === 'owner');
      let id = existing?.id;
      if (!id) {
        const made = await cal.calendars.insert({
          requestBody: {
            summary: CORTEX_CALENDAR_NAME,
            description: 'Time blocks from Cortex. Edit them here or in Cortex.',
            timeZone: Intl.DateTimeFormat().resolvedOptions().timeZone,
          },
        });
        id = made.data.id ?? undefined;
      }
      if (!id) throw new Error('Google did not return the Cortex calendar.');
      cortexId = id;
      calendarId.set(id);
      return id;
    });

  const body = (d: EventDraft): calendar_v3.Schema$Event => ({
    summary: d.title,
    start: { dateTime: d.start },
    end: { dateTime: d.end },
    reminders: { useDefault: false },
    extendedProperties: { private: { cortexTaskId: d.cortexTaskId } },
  });
  const mapOne = (calId: string, e: calendar_v3.Schema$Event): RemoteEvent => {
    const r = toRemoteEvent(calId, e);
    if (!r) throw new Error('Google returned an event Cortex could not read.');
    return r;
  };

  const metaOf = (m: {
    id?: string | null;
    snippet?: string | null;
    internalDate?: string | null;
    payload?: { headers?: { name?: string | null; value?: string | null }[] | null } | null;
  }): MailMeta => {
    const header = (name: string) =>
      m.payload?.headers?.find((h) => h.name?.toLowerCase() === name.toLowerCase())?.value ?? '';
    return {
      id: m.id ?? '',
      from: header('From'),
      subject: header('Subject') || '(no subject)',
      date: new Date(Number(m.internalDate ?? Date.now())).toISOString(),
      snippet: m.snippet ?? '',
    };
  };

  return {
    profile: () =>
      run('calendar', async () => {
        const res = await cal.calendarList.get({ calendarId: 'primary' });
        return { email: res.data.id ?? 'your Google account' };
      }),
    calendars: { listCalendars, listEvents },
    cortex: {
      ensure,
      list: async (fromIso, toIso) => listEvents(await ensure(), fromIso, toIso),
      get: async (eventId) => {
        const id = await ensure();
        try {
          const res = await cal.events.get({ calendarId: id, eventId });
          return toRemoteEvent(id, res.data);
        } catch (error) {
          const status = statusOf(error);
          if (status === 404 || status === 410) return null;
          throw mapGoogleError(error, 'calendar');
        }
      },
      insert: async (draft) => {
        const id = await ensure();
        return run('calendar', async () =>
          mapOne(id, (await cal.events.insert({ calendarId: id, requestBody: body(draft) })).data),
        );
      },
      patch: async (eventId, draft) => {
        const id = await ensure();
        return run('calendar', async () =>
          mapOne(
            id,
            (await cal.events.patch({ calendarId: id, eventId, requestBody: body(draft) })).data,
          ),
        );
      },
      remove: async (eventId) => {
        const id = await ensure();
        try {
          await cal.events.delete({ calendarId: id, eventId });
        } catch (error) {
          const status = statusOf(error);
          if (status === 404 || status === 410) return; // Already gone.
          throw mapGoogleError(error, 'calendar');
        }
      },
    },
    mail: {
      listInbox: (afterMs, max) =>
        run('mail', async () => {
          const res = await mail.users.messages.list({
            userId: 'me',
            q: `in:inbox -category:promotions -category:social -category:updates after:${Math.floor(afterMs / 1000)}`,
            maxResults: max,
          });
          return (res.data.messages ?? []).map((m) => m.id ?? '').filter(Boolean);
        }),
      // format=metadata returns headers and Gmail's snippet only: never the body or attachments.
      getMeta: (id) =>
        run('mail', async () =>
          metaOf(
            (
              await mail.users.messages.get({
                userId: 'me',
                id,
                format: 'metadata',
                metadataHeaders: ['From', 'Subject', 'Date'],
              })
            ).data,
          ),
        ),
    },
  };
}

/** The real thing: sign in through the browser, and build a backend from the saved sign-in. */
export function createGoogleAuth(deps: {
  openUrl: (url: string) => Promise<void> | void;
  calendarId: CalendarIdStore;
}): GoogleAuth {
  return {
    async authorize(client) {
      const tokens = await runLoopbackSignIn({
        openUrl: deps.openUrl,
        buildUrl: ({ redirectUri, state, codeChallenge }) =>
          new OAuth2Client(client.clientId, client.clientSecret, redirectUri).generateAuthUrl({
            access_type: 'offline',
            prompt: 'consent',
            scope: [...GOOGLE_SCOPES],
            state,
            code_challenge: codeChallenge,
            code_challenge_method: CodeChallengeMethod.S256,
          }),
        exchange: async ({ code, codeVerifier, redirectUri }) => {
          try {
            const oauth = new OAuth2Client(client.clientId, client.clientSecret, redirectUri);
            const { tokens: got } = await oauth.getToken({
              code,
              codeVerifier,
              redirect_uri: redirectUri,
            });
            if (!got.refresh_token) {
              throw new Error(
                'Google did not give Cortex a long-lasting sign-in. Remove Cortex at myaccount.google.com/permissions and try again.',
              );
            }
            return { refreshToken: got.refresh_token };
          } catch (error) {
            throw mapGoogleError(error, 'sign-in');
          }
        },
      });
      return tokens;
    },
    async revoke(client, tokens) {
      try {
        await new OAuth2Client(client.clientId, client.clientSecret).revokeToken(
          tokens.refreshToken,
        );
      } catch {
        // Already revoked, or offline: the saved copy is forgotten either way.
      }
    },
    backend: (client, tokens) => createGoogleBackend(client, tokens, deps.calendarId),
  };
}
