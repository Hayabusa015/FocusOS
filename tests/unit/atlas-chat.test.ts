import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { DEFAULT_SETTINGS } from '../../src/shared/core';
import type { AppSettings } from '../../src/shared/core';
import { createChat } from '../../src/main/atlas/chat';
import type { AtlasDeps } from '../../src/main/atlas/engine';
import { AtlasError } from '../../src/main/atlas/errors';
import { createMemorySecretStore } from '../../src/main/atlas/secrets';
import { TOOL_SPECS } from '../../src/main/atlas/tools';
import { getSpend } from '../../src/main/atlas/usage';
import { openDatabase } from '../../src/main/db/connection';
import type { Db } from '../../src/main/db/connection';
import { runMigrations } from '../../src/main/db/migrate';
import { createStore } from '../../src/main/db/store';
import type { Store } from '../../src/main/db/store';
import { createFakeAnthropic } from '../helpers/fake-anthropic';
import type { FakeAnthropic } from '../helpers/fake-anthropic';

// TZ is America/New_York. 2026-10-14 is a Wednesday, so Friday is 2026-10-16.
let now: Date;
let db: Db;
let store: Store;
let fake: FakeAnthropic;
let settings: AppSettings;
let deps: AtlasDeps;

const KEY = 'sk-ant-test-key-0123456789abcdef';
const say = (text: string) => ({ blocks: [{ type: 'text' as const, text }] });
const call = (name: string, input: unknown) => ({
  blocks: [{ type: 'tool_use' as const, name, input }],
});

beforeEach(() => {
  now = new Date(2026, 9, 14, 10, 0, 0);
  db = openDatabase(':memory:');
  runMigrations(db);
  store = createStore(db, { clock: () => now });
  store.seedAreas();
  fake = createFakeAnthropic();
  settings = { ...DEFAULT_SETTINGS };
  const secrets = createMemorySecretStore();
  secrets.set(KEY);
  deps = { store, secrets, settings: () => settings, createClient: fake.createClient };
});
afterEach(() => db.close());

describe('chat: acting on the lists', () => {
  it('"Add grade lab reports to Chemistry for Friday" creates the right task, once', async () => {
    fake.push(
      call('create_task', { title: 'Grade lab reports', area: 'Chemistry', dueDate: '2026-10-16' }),
      say('Added: Grade lab reports, Chemistry, Friday.'),
    );
    const chat = createChat(deps);
    const out = await chat.send('Add grade lab reports to Chemistry for Friday');

    const tasks = store.listTasks({ view: 'area', areaId: store.listAreas()[0]!.id });
    expect(tasks).toHaveLength(1);
    expect(tasks[0]).toMatchObject({
      title: 'Grade lab reports',
      dueDate: '2026-10-16',
      status: 'todo',
      source: 'atlas',
    });
    expect(out.reply).toBe('Added: Grade lab reports, Chemistry, Friday.');
    expect(out.changes).toHaveLength(1);
  });

  it('"I finished it" completes the task discussed earlier', async () => {
    const made = store.createTask({ title: 'Print the quiz', dueDate: '2026-10-14' });
    const id = made.result.id;
    fake.push(say('That one is due today.'));
    const chat = createChat(deps);
    await chat.send('What is the quiz thing due today?');
    fake.push(call('complete_task', { id }), say('Print the quiz is done. Nicely handled.'));
    await chat.send('I finished it');
    expect(store.getTask(id)?.status).toBe('done');
    // The second turn carried the first turn's history.
    const second = fake.requests[1]!.body.messages;
    expect(JSON.stringify(second)).toContain('What is the quiz thing due today?');
  });

  it('every change Atlas makes is logged as Atlas and can be undone', async () => {
    fake.push(call('create_task', { title: 'Order beakers', area: 'chemistry' }), say('Done.'));
    const chat = createChat(deps);
    const out = await chat.send('Order beakers for chemistry');
    const today = store.listAtlasChanges();
    expect(today.map((e) => e.summary)).toEqual(['Added "Order beakers"']);
    expect(today[0]!.actor).toBe('atlas');
    expect(store.undo(out.changes[0]!.logId)).not.toBeNull();
    expect(store.search('beakers').tasks).toHaveLength(0);
  });

  it('a tool problem comes back to the model as text, not as a crash', async () => {
    fake.push(
      call('create_task', { title: 'X', area: 'Astrology' }),
      say('There is no such area.'),
    );
    const chat = createChat(deps);
    const out = await chat.send('Add X to Astrology');
    const result = JSON.stringify(fake.requests[1]!.body.messages.at(-1));
    expect(result).toContain('There is no area called');
    expect(out.reply).toBe('There is no such area.');
    expect(store.search('X').tasks).toHaveLength(0);
  });

  it('bad tool input is rejected before it runs', async () => {
    fake.push(call('create_task', { title: '' }), say('Sorry.'));
    await createChat(deps).send('add nothing');
    expect(JSON.stringify(fake.requests[1]!.body.messages.at(-1))).toMatch(
      /error|invalid|too_small/i,
    );
    expect(store.listTasks({ view: 'inbox' })).toHaveLength(0);
  });
});

describe('chat: how the request is built (PLAN §7.2)', () => {
  it('uses the route model, adaptive thinking, effort, fallback, streaming and no forced tool', async () => {
    fake.push(say('Hello.'));
    await createChat(deps).send('hi');
    const r = fake.requests[0]!;
    expect(r.body.model).toBe('claude-opus-5-5');
    expect(r.body.thinking).toEqual({ type: 'adaptive' });
    expect(r.body.output_config?.effort).toBe('low');
    expect(r.body.stream).toBe(true);
    expect(r.body.fallbacks).toBe('default');
    expect(r.headers['anthropic-beta']).toContain('server-side-fallback-2026-07-01');
    expect(r.body.tool_choice).toBeUndefined();
    expect(JSON.stringify(r.body)).not.toContain('budget_tokens');
  });

  it("follows the user's model and effort settings, and skips fallback on Haiku", async () => {
    settings = {
      ...settings,
      atlasRoutes: { chat: { model: 'claude-haiku-5-5', effort: 'high' } },
    };
    fake.push(say('Hello.'));
    await createChat(deps).send('hi');
    const r = fake.requests[0]!;
    expect(r.body.model).toBe('claude-haiku-5-5');
    expect(r.body.output_config?.effort).toBe('high');
    expect(r.body.fallbacks).toBeUndefined();
  });

  it("sends today's snapshot as a system message after the user turn, not in the persona", async () => {
    fake.push(say('Hello.'));
    await createChat(deps).send('hi');
    const body = fake.requests[0]!.body;
    const roles = body.messages.map((m) => m.role);
    expect(roles).toEqual(['user', 'system']);
    expect(String(body.messages[1]!.content)).toContain('Today is Wednesday 2026-10-14');
    expect(JSON.stringify(body.system)).not.toContain('2026');
  });

  it('keeps history append-only: each request begins with the whole previous one', async () => {
    fake.push(call('list_areas', {}), say('Seven areas.'), say('Still seven.'));
    const chat = createChat(deps);
    await chat.send('what areas are there?');
    now = new Date(2026, 9, 14, 10, 5, 0);
    await chat.send('and now?');
    const strip = (v: unknown) =>
      JSON.stringify(v, (k, x) => (k === 'cache_control' ? undefined : x));
    const [a, b, c] = fake.requests.map((r) => r.body);
    // Within one turn (a tool round-trip) and across turns, earlier messages never change.
    expect(strip(b!.messages.slice(0, a!.messages.length))).toBe(strip(a!.messages));
    expect(strip(c!.messages.slice(0, b!.messages.length))).toBe(strip(b!.messages));
    expect(strip(c!.system)).toBe(strip(a!.system));
    expect(strip(c!.tools)).toBe(strip(a!.tools));
  });

  it('the second turn reads the cache (cache reads above zero)', async () => {
    fake.push(say('One.'), say('Two.'));
    const chat = createChat(deps);
    await chat.send('first');
    now = new Date(2026, 9, 14, 10, 1, 0);
    await chat.send('second');
    const rows = db
      .prepare('SELECT cache_read_tokens AS r FROM api_usage ORDER BY created_at, rowid')
      .all() as { r: number }[];
    expect(rows[0]!.r).toBe(0);
    expect(rows[1]!.r).toBeGreaterThan(0);
  });

  it('marks the cache breakpoint after the persona', async () => {
    fake.push(say('Hi.'));
    await createChat(deps).send('hi');
    expect(fake.requests[0]!.body.system?.at(-1)?.cache_control).toEqual({ type: 'ephemeral' });
  });
});

describe('chat: storage and a new day', () => {
  it("shows today's conversation as plain lines, without tool plumbing", async () => {
    fake.push(call('list_areas', {}), say('Seven areas.'));
    const chat = createChat(deps);
    await chat.send('list my areas');
    expect(chat.history()).toEqual([
      { role: 'user', text: 'list my areas' },
      { role: 'assistant', text: 'Seven areas.' },
    ]);
  });

  it('a new local day starts a new conversation', async () => {
    fake.push(say('One.'), say('Two.'));
    const chat = createChat(deps);
    await chat.send('first day');
    now = new Date(2026, 9, 15, 9, 0, 0);
    expect(chat.history()).toEqual([]);
    await chat.send('second day');
    expect(JSON.stringify(fake.requests[1]!.body.messages)).not.toContain('first day');
  });

  it('leaves the transcript alone when a call fails', async () => {
    fake.push({ error: { status: 529, type: 'overloaded_error', message: 'busy' } });
    const chat = createChat(deps);
    await expect(chat.send('hello')).rejects.toBeInstanceOf(AtlasError);
    expect(chat.history()).toEqual([]);
    fake.push(say('Back.'));
    await chat.send('hello again');
    // No orphaned user/system pair from the failed attempt.
    expect(fake.requests.at(-1)!.body.messages.map((m) => m.role)).toEqual(['user', 'system']);
  });
});

describe('chat: keys, errors, refusals and the cap', () => {
  it('with no key it says so and makes no call; the rest of the app is untouched', async () => {
    const secrets = createMemorySecretStore();
    const chat = createChat({ ...deps, secrets });
    await expect(chat.send('hi')).rejects.toMatchObject({ kind: 'no-key' });
    expect(fake.requests).toHaveLength(0);
    expect(store.createTask({ title: 'Still works' }).result.title).toBe('Still works');
  });

  it('shows a rejected key in plain words', async () => {
    fake.push({ error: { status: 401, type: 'authentication_error', message: 'bad key' } });
    await expect(createChat(deps).send('hi')).rejects.toMatchObject({ kind: 'bad-key' });
  });

  it('shows a rate limit as "unavailable"', async () => {
    fake.push({ error: { status: 429, type: 'rate_limit_error', message: 'slow down' } });
    await expect(createChat(deps).send('hi')).rejects.toMatchObject({ kind: 'unavailable' });
  });

  it('handles a refusal without saving the turn', async () => {
    fake.push({ blocks: [], stop: 'refusal' });
    const chat = createChat(deps);
    await expect(chat.send('something')).rejects.toMatchObject({ kind: 'refused' });
    expect(chat.history()).toEqual([]);
  });

  it('records every call in the cost ledger, and refuses once the cap is reached', async () => {
    settings = { ...settings, atlasMonthlyCapUsd: 0.0001 };
    fake.push({ blocks: [{ type: 'text', text: 'Hi.' }], outputTokens: 50_000 });
    const chat = createChat(deps);
    await chat.send('first');
    expect(getSpend(store.ctx).month).toBeGreaterThan(0.0001);
    await expect(chat.send('second')).rejects.toMatchObject({ kind: 'cap' });
    expect(fake.requests).toHaveLength(1);
  });

  it('refuses a second message while one is still being answered', async () => {
    fake.push(say('One.'));
    const chat = createChat(deps);
    const first = chat.send('a');
    await expect(chat.send('b')).rejects.toMatchObject({ kind: 'invalid' });
    await first;
  });

  it('streams text as it arrives', async () => {
    fake.push(say('One two three.'));
    const pieces: string[] = [];
    await createChat(deps).send('count', { onText: (d) => pieces.push(d) });
    expect(pieces.length).toBeGreaterThan(1);
    expect(pieces.join('')).toBe('One two three.');
  });
});

describe('tools', () => {
  it('archive_task is soft: the task can be brought back', async () => {
    const t = store.createTask({ title: 'Old thing' }).result;
    fake.push(call('archive_task', { id: t.id }), say('Archived.'));
    const out = await createChat(deps).send('drop the old thing');
    expect(store.getTask(t.id)).toBeNull();
    store.undo(out.changes[0]!.logId);
    expect(store.getTask(t.id)?.title).toBe('Old thing');
  });

  it('has no tool that hard-deletes, sends email or changes settings', () => {
    const names = TOOL_SPECS.map((t) => t.name);
    for (const banned of ['delete', 'send', 'email', 'setting', 'secret'])
      expect(names.filter((n) => n.includes(banned))).toEqual([]);
  });

  it('reschedule_task moves the date and counts a deferral past today', async () => {
    const t = store.createTask({ title: 'Plan unit', dueDate: '2026-10-14' }).result;
    fake.push(call('reschedule_task', { id: t.id, dueDate: '2026-10-17' }), say('Moved.'));
    await createChat(deps).send('push that to Saturday');
    expect(store.getTask(t.id)).toMatchObject({ dueDate: '2026-10-17', deferCount: 1 });
  });
});
