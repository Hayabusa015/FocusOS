import { describe, expect, it } from 'vitest';
import { DEFAULT_SETTINGS } from '../../src/shared/core';
import { createChat } from '../../src/main/atlas/chat';
import { createMemorySecretStore } from '../../src/main/atlas/secrets';
import { brainDump } from '../../src/main/atlas/modes/scribe';
import { getSpend, recentUsage } from '../../src/main/atlas/usage';
import { openDatabase } from '../../src/main/db/connection';
import { runMigrations } from '../../src/main/db/migrate';
import { createStore } from '../../src/main/db/store';

/**
 * Runs only when ANTHROPIC_API_KEY is set (`npm run test:live`). It makes one real, small chat
 * call on the cheapest model and costs a fraction of a cent. It checks that the request shape this
 * app sends (adaptive thinking, effort, fallbacks, tools, mid-conversation system message) is
 * accepted by the real API, and that a real tool call changes the real lists.
 */
const key = process.env['ANTHROPIC_API_KEY'];

describe.skipIf(!key)('Atlas against the real API', () => {
  it('adds a task from a plain sentence and records the spend', async () => {
    const db = openDatabase(':memory:');
    runMigrations(db);
    const store = createStore(db);
    store.seedAreas();
    const secrets = createMemorySecretStore(key!);
    const settings = {
      ...DEFAULT_SETTINGS,
      atlasRoutes: { chat: { model: 'claude-haiku-5-5' as const, effort: 'low' as const } },
    };
    const chat = createChat({ store, secrets, settings: () => settings });

    const out = await chat.send('Add "live smoke test" to Chemistry, no date.');
    const chem = store.listAreas().find((a) => a.name === 'Chemistry')!;
    const titles = store
      .listTasks({ view: 'area', areaId: chem.id })
      .map((t) => t.title.toLowerCase());
    expect(titles.some((t) => t.includes('live smoke test'))).toBe(true);
    expect(out.reply.length).toBeGreaterThan(0);
    expect(getSpend(store.ctx).today).toBeGreaterThan(0);

    // A second turn must still be accepted: history is replayed exactly as stored.
    const second = await chat.send('Thanks. What did you just add?');
    expect(second.reply.length).toBeGreaterThan(0);
    db.close();
  });

  it('the default (Opus) route accepts fallbacks, caching and structured output', async () => {
    const db = openDatabase(':memory:');
    runMigrations(db);
    const store = createStore(db);
    store.seedAreas();
    const deps = {
      store,
      secrets: createMemorySecretStore(key!),
      settings: () => ({ ...DEFAULT_SETTINGS }),
    };
    const dump = await brainDump(
      deps,
      'grade the lab reports for chemistry, call the plumber, maybe rethink seating?',
    );
    expect(dump.tasks.length).toBeGreaterThanOrEqual(2);
    const chat = createChat(deps);
    await chat.send('What areas do I have?');
    await chat.send('And which one is first?');
    expect(recentUsage(store.ctx, 1)).toHaveLength(1);
    db.close();
  });
});
