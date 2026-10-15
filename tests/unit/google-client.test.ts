import { beforeEach, describe, expect, it, vi } from 'vitest';

/**
 * The real Google client, with Google's libraries replaced by recorders. This is where the two
 * promises that matter are checked on the real code: only the "Cortex" calendar is ever written
 * to (CLAUDE.md rule 7), and Gmail is only ever asked for headers and a snippet, never a body.
 */
const calls = vi.hoisted(() => ({
  cal: [] as [string, unknown][],
  mail: [] as [string, unknown][],
}));
const state = vi.hoisted(() => ({
  calendars: [] as { id: string; summary: string; accessRole: string; primary?: boolean }[],
  failWith: null as unknown,
}));

vi.mock('google-auth-library', () => ({
  CodeChallengeMethod: { S256: 'S256' },
  OAuth2Client: class {
    setCredentials() {}
    generateAuthUrl() {
      return 'https://accounts.google.com/o/oauth2/v2/auth';
    }
    async getToken() {
      return { tokens: { refresh_token: 'r' } };
    }
    async revokeToken() {}
  },
}));

interface Arg {
  eventId: string;
  requestBody: { summary: string; start: unknown; end: unknown; extendedProperties: unknown };
}

vi.mock('@googleapis/calendar', () => ({
  calendar: () => {
    const rec =
      <T>(name: string, result: (arg: Arg) => T) =>
      async (arg: unknown) => {
        calls.cal.push([name, arg]);
        if (state.failWith) throw state.failWith;
        return { data: result(arg as Arg) };
      };
    return {
      calendarList: {
        list: rec('calendarList.list', () => ({ items: state.calendars })),
        get: rec('calendarList.get', () => ({ id: 'teacher@example.com' })),
      },
      calendars: {
        insert: rec('calendars.insert', (a) => {
          const made = { id: 'new-cortex', summary: a.requestBody.summary, accessRole: 'owner' };
          state.calendars.push(made);
          return made;
        }),
      },
      events: {
        list: rec('events.list', () => ({
          items: [
            {
              id: 'timed',
              summary: 'Staff meeting',
              start: { dateTime: '2026-10-14T08:00:00-04:00' },
              end: { dateTime: '2026-10-14T09:00:00-04:00' },
              etag: '"1"',
              updated: '2026-10-13T12:00:00.000Z',
              extendedProperties: { private: { cortexTaskId: 'task-1' } },
            },
            {
              id: 'allday',
              start: { date: '2026-10-14' },
              end: { date: '2026-10-15' },
              etag: '"2"',
            },
            {
              id: 'gone',
              status: 'cancelled',
              start: { date: '2026-10-14' },
              end: { date: '2026-10-15' },
            },
          ],
        })),
        insert: rec('events.insert', (a) => ({
          id: 'created',
          summary: a.requestBody.summary,
          start: a.requestBody.start,
          end: a.requestBody.end,
          extendedProperties: a.requestBody.extendedProperties,
          etag: '"3"',
        })),
        patch: rec('events.patch', (a) => ({
          id: a.eventId,
          summary: a.requestBody.summary,
          start: a.requestBody.start,
          end: a.requestBody.end,
          extendedProperties: a.requestBody.extendedProperties,
          etag: '"4"',
        })),
        delete: rec('events.delete', () => ({})),
        get: rec('events.get', (a) => ({
          id: (a as unknown as { eventId: string }).eventId,
          summary: 'Moved far away',
          start: { dateTime: '2027-03-10T09:00:00-05:00' },
          end: { dateTime: '2027-03-10T09:45:00-05:00' },
          etag: '"5"',
        })),
      },
    };
  },
}));

vi.mock('@googleapis/gmail', () => ({
  gmail: () => ({
    users: {
      messages: {
        list: async (arg: unknown) => {
          calls.mail.push(['list', arg]);
          return { data: { messages: [{ id: 'm1' }, { id: 'm2' }] } };
        },
        get: async (arg: unknown) => {
          calls.mail.push(['get', arg]);
          return {
            data: {
              id: 'm1',
              snippet: 'A short snippet',
              internalDate: '1792000000000',
              payload: {
                headers: [
                  { name: 'From', value: 'Principal <p@school.example>' },
                  { name: 'Subject', value: 'Please sign' },
                ],
                body: { data: 'THE-BODY-MUST-NEVER-BE-READ' },
              },
            },
          };
        },
      },
    },
  }),
}));

import { createGoogleBackend, mapGoogleError } from '../../src/main/google/client';
import { PermissionDeniedError, SignInRequiredError } from '../../src/main/google/types';

const store = () => {
  let saved: string | null = null;
  return { get: () => saved, set: (id: string) => void (saved = id), peek: () => saved };
};
const backend = (ids = store()) =>
  createGoogleBackend({ clientId: 'id', clientSecret: 'secret' }, { refreshToken: 't' }, ids);
const writes = () =>
  calls.cal.filter(([name]) => /^(events\.(insert|patch|delete)|calendars\.insert)$/.test(name));

beforeEach(() => {
  calls.cal.length = 0;
  calls.mail.length = 0;
  state.failWith = null;
  state.calendars = [
    { id: 'primary-cal', summary: 'Personal', accessRole: 'owner', primary: true },
    { id: 'school', summary: 'Garfield staff', accessRole: 'reader' },
  ];
});

describe('the real Google client: writing (CLAUDE.md rule 7)', () => {
  it('creates a calendar named Cortex when there is none, and remembers it', async () => {
    const ids = store();
    expect(await backend(ids).cortex.ensure()).toBe('new-cortex');
    expect(calls.cal.find(([n]) => n === 'calendars.insert')?.[1]).toMatchObject({
      requestBody: { summary: 'Cortex' },
    });
    expect(ids.peek()).toBe('new-cortex');
  });

  it('reuses a calendar it owns that is already named Cortex, and a remembered id without asking Google', async () => {
    state.calendars.push({ id: 'old-cortex', summary: 'Cortex', accessRole: 'owner' });
    expect(await backend().cortex.ensure()).toBe('old-cortex');
    expect(writes()).toHaveLength(0);

    calls.cal.length = 0;
    const ids = store();
    ids.set('remembered');
    expect(await backend(ids).cortex.ensure()).toBe('remembered');
    expect(calls.cal).toHaveLength(0);
  });

  it('does not take over a calendar named Cortex that it cannot own', async () => {
    state.calendars.push({ id: 'theirs', summary: 'Cortex', accessRole: 'reader' });
    expect(await backend().cortex.ensure()).toBe('new-cortex');
  });

  it('every write goes to the Cortex calendar, never to one the caller names', async () => {
    const b = backend();
    const when = { start: '2026-10-14T18:00:00.000Z', end: '2026-10-14T18:45:00.000Z' };
    await b.cortex.insert({ title: 'Grade', ...when, cortexTaskId: 't1' });
    await b.cortex.patch('created', { title: 'Grade 2', ...when, cortexTaskId: 't1' });
    await b.cortex.remove('created');
    const eventWrites = writes().filter(([n]) => n.startsWith('events.'));
    expect(eventWrites.map(([n]) => n)).toEqual(['events.insert', 'events.patch', 'events.delete']);
    for (const [, arg] of eventWrites) {
      expect((arg as { calendarId: string }).calendarId).toBe('new-cortex');
    }
  });

  it('the writing interface cannot be pointed at another calendar', () => {
    const b = backend();
    expect(b.cortex.insert.length).toBe(1);
    expect(b.cortex.patch.length).toBe(2);
    expect(b.cortex.remove.length).toBe(1);
    // Reading takes a calendar id; writing does not.
    expect(Object.keys(b.calendars).sort()).toEqual(['listCalendars', 'listEvents']);
  });

  it('tags each event with its task, and keeps the title and time', async () => {
    const made = await backend().cortex.insert({
      title: 'Grade',
      start: '2026-10-14T18:00:00.000Z',
      end: '2026-10-14T18:45:00.000Z',
      cortexTaskId: 'task-9',
    });
    expect(calls.cal.find(([n]) => n === 'events.insert')?.[1]).toMatchObject({
      requestBody: {
        summary: 'Grade',
        reminders: { useDefault: false },
        extendedProperties: { private: { cortexTaskId: 'task-9' } },
      },
    });
    expect(made).toMatchObject({ id: 'created', title: 'Grade', cortexTaskId: 'task-9' });
  });

  it('finds one event by id wherever it now is, and says null when it is gone', async () => {
    const b = backend();
    const found = await b.cortex.get('abc');
    expect(found).toMatchObject({
      id: 'abc',
      title: 'Moved far away',
      start: '2027-03-10T14:00:00.000Z',
    });
    expect(calls.cal.find(([n]) => n === 'events.get')?.[1]).toMatchObject({
      calendarId: 'new-cortex',
      eventId: 'abc',
    });
    state.failWith = { status: 404 };
    expect(await b.cortex.get('abc')).toBeNull();
    state.failWith = { status: 410 };
    expect(await b.cortex.get('abc')).toBeNull();
  });

  it('treats deleting an event that is already gone as done', async () => {
    const b = backend();
    await b.cortex.ensure(); // Known from before: only the delete itself fails below.
    state.failWith = { status: 404 };
    await expect(b.cortex.remove('x')).resolves.toBeUndefined();
    state.failWith = { status: 410 };
    await expect(b.cortex.remove('x')).resolves.toBeUndefined();
  });
});

describe('the real Google client: reading', () => {
  it('turns Google events into plain ones: UTC instants, all-day dates, the task tag, no cancelled ones', async () => {
    const events = await backend().calendars.listEvents('primary-cal', 'a', 'b');
    expect(events.map((e) => e.id)).toEqual(['timed', 'allday']);
    expect(events[0]).toMatchObject({
      title: 'Staff meeting',
      start: '2026-10-14T12:00:00.000Z',
      end: '2026-10-14T13:00:00.000Z',
      allDay: false,
      cortexTaskId: 'task-1',
      etag: '"1"',
    });
    expect(events[1]).toMatchObject({
      title: '(no title)',
      start: '2026-10-14',
      end: '2026-10-15',
      allDay: true,
      cortexTaskId: null,
    });
    expect(writes()).toHaveLength(0);
  });

  it('lists calendars with the name the user gave them', async () => {
    const list = await backend().calendars.listCalendars();
    expect(list.map((c) => [c.name, c.primary, c.accessRole])).toEqual([
      ['Personal', true, 'owner'],
      ['Garfield staff', false, 'reader'],
    ]);
  });
});

describe('the real Google client: mail (PLAN §9.4)', () => {
  it('lists only inbox mail outside Promotions, Social and Updates, newer than the last run', async () => {
    const ids = await backend().mail.listInbox(1_792_000_000_000, 25);
    expect(ids).toEqual(['m1', 'm2']);
    const [, arg] = calls.mail[0]!;
    expect(arg).toMatchObject({ userId: 'me', maxResults: 25 });
    const q = (arg as { q: string }).q;
    expect(q).toContain('in:inbox');
    expect(q).toContain('-category:promotions');
    expect(q).toContain('-category:social');
    expect(q).toContain('-category:updates');
    expect(q).toContain('after:1792000000');
  });

  it('asks for headers and the snippet only, and never returns a body', async () => {
    const meta = await backend().mail.getMeta('m1');
    const [, arg] = calls.mail[0]!;
    expect(arg).toMatchObject({ format: 'metadata', metadataHeaders: ['From', 'Subject', 'Date'] });
    expect((arg as { format: string }).format).not.toBe('full');
    expect(meta).toEqual({
      id: 'm1',
      from: 'Principal <p@school.example>',
      subject: 'Please sign',
      date: new Date(1_792_000_000_000).toISOString(),
      snippet: 'A short snippet',
    });
    expect(JSON.stringify(meta)).not.toContain('MUST-NEVER');
  });
});

describe('what Google’s errors become', () => {
  it('a refused or expired sign-in', () => {
    expect(mapGoogleError({ status: 401 }, 'calendar')).toBeInstanceOf(SignInRequiredError);
    expect(
      mapGoogleError(new Error('invalid_grant: Token has been revoked'), 'calendar'),
    ).toBeInstanceOf(SignInRequiredError);
  });

  it('a refused Gmail permission is its own thing, so Calendar keeps working', () => {
    expect(mapGoogleError({ status: 403 }, 'mail')).toBeInstanceOf(PermissionDeniedError);
    expect(mapGoogleError({ status: 403 }, 'calendar')).not.toBeInstanceOf(PermissionDeniedError);
    expect(mapGoogleError({ status: 403 }, 'calendar').message).toMatch(/Cortex/);
  });

  it('an API that was never switched on, a wrong client, and a busy Google', () => {
    expect(
      mapGoogleError(
        { status: 403, message: 'Calendar API has not been used in project 123' },
        'calendar',
      ).message,
    ).toMatch(/not switched on/);
    expect(mapGoogleError(new Error('invalid_client'), 'sign-in').message).toMatch(
      /client ID and secret/,
    );
    expect(mapGoogleError({ status: 503 }, 'calendar').message).toMatch(/busy/);
    expect(mapGoogleError({ status: 429 }, 'calendar').message).toMatch(/busy/);
  });
});
