import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import Anthropic from '@anthropic-ai/sdk';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { ATLAS_MODELS, ATLAS_ROUTES, DEFAULT_ROUTES, resolveRoute } from '../../src/shared/atlas';
import { AppSettings, DEFAULT_SETTINGS } from '../../src/shared/core';
import { AtlasError, describeError } from '../../src/main/atlas/errors';
import { PRICES, estimateCost } from '../../src/main/atlas/pricing';
import {
  createFileSecretStore,
  createMemorySecretStore,
  looksLikeAnthropicKey,
} from '../../src/main/atlas/secrets';
import { assertUnderCap, getSpend, recordUsage } from '../../src/main/atlas/usage';
import { openDatabase } from '../../src/main/db/connection';
import type { Db } from '../../src/main/db/connection';
import { createCtx } from '../../src/main/db/context';
import { runMigrations } from '../../src/main/db/migrate';

const usage = (over: Partial<Record<string, number>> = {}) => ({
  inputTokens: 0,
  outputTokens: 0,
  cacheReadTokens: 0,
  cacheWriteTokens: 0,
  ...over,
});

describe('routes (PLAN §7.1)', () => {
  it("every route defaults to Opus 5.5, with the plan's effort", () => {
    expect(DEFAULT_ROUTES).toEqual({
      chat: { model: 'claude-opus-5-5', effort: 'low' },
      sorter: { model: 'claude-opus-5-5', effort: 'low' },
      planner: { model: 'claude-opus-5-5', effort: 'medium' },
      scribe: { model: 'claude-opus-5-5', effort: 'low' },
      triage: { model: 'claude-opus-5-5', effort: 'low' },
      briefing: { model: 'claude-opus-5-5', effort: 'low' },
      reviewer: { model: 'claude-opus-5-5', effort: 'medium' },
    });
    expect(Object.keys(DEFAULT_ROUTES).sort()).toEqual([...ATLAS_ROUTES].sort());
  });

  it('offers exactly the three models, with no date suffix', () => {
    expect(ATLAS_MODELS).toEqual(['claude-opus-5-5', 'claude-sonnet-5-5', 'claude-haiku-5-5']);
    for (const id of ATLAS_MODELS) expect(id).not.toMatch(/\d{8}/);
  });

  it("uses the user's choice for a route and the default for the rest", () => {
    const overrides = {
      sorter: { model: 'claude-haiku-5-5' as const },
      planner: { effort: 'high' as const },
    };
    expect(resolveRoute('sorter', overrides)).toEqual({ model: 'claude-haiku-5-5', effort: 'low' });
    expect(resolveRoute('planner', overrides)).toEqual({
      model: 'claude-opus-5-5',
      effort: 'high',
    });
    expect(resolveRoute('chat', overrides)).toEqual(DEFAULT_ROUTES.chat);
  });

  it('keeps the settings valid with and without overrides', () => {
    expect(AppSettings.parse(DEFAULT_SETTINGS).atlasRoutes).toEqual({});
    expect(
      AppSettings.safeParse({ ...DEFAULT_SETTINGS, atlasRoutes: { chat: { model: 'gpt-5' } } })
        .success,
    ).toBe(false);
    expect(AppSettings.safeParse({ ...DEFAULT_SETTINGS, atlasMonthlyCapUsd: 25 }).success).toBe(
      true,
    );
    expect(AppSettings.safeParse({ ...DEFAULT_SETTINGS, atlasMonthlyCapUsd: -1 }).success).toBe(
      false,
    );
  });
});

describe('pricing', () => {
  it('prices a call from the table', () => {
    // 1M in + 1M out on Opus 5.5 is $4 + $20.
    expect(
      estimateCost('claude-opus-5-5', usage({ inputTokens: 1_000_000, outputTokens: 1_000_000 })),
    ).toBe(24);
    expect(
      estimateCost('claude-sonnet-5-5', usage({ inputTokens: 1_000_000, outputTokens: 1_000_000 })),
    ).toBe(12);
  });

  it('charges cache reads less and cache writes 1.25x', () => {
    expect(estimateCost('claude-opus-5-5', usage({ cacheReadTokens: 1_000_000 }))).toBe(
      PRICES['claude-opus-5-5'].cacheRead,
    );
    expect(estimateCost('claude-opus-5-5', usage({ cacheWriteTokens: 1_000_000 }))).toBe(5);
  });

  it('charges Haiku 5.5 more once the prompt is over 100K tokens', () => {
    expect(estimateCost('claude-haiku-5-5', usage({ inputTokens: 100_000 }))).toBe(0.01);
    expect(estimateCost('claude-haiku-5-5', usage({ inputTokens: 200_000 }))).toBe(0.1);
  });

  it('prices an unknown model like the dearest known one, so a cap never under-counts', () => {
    expect(estimateCost('claude-future-9', usage({ inputTokens: 1_000_000 }))).toBe(
      estimateCost('claude-opus-5-5', usage({ inputTokens: 1_000_000 })),
    );
  });
});

describe('usage ledger and the monthly cap', () => {
  let db: Db;
  let now: Date;
  beforeEach(() => {
    db = openDatabase(':memory:');
    runMigrations(db);
    now = new Date(2026, 9, 14, 10, 0); // Wednesday 14 October
  });
  afterEach(() => db.close());
  const ctx = () => createCtx(db, () => now);

  it('records each call and sums spend for today, this week and this month', () => {
    const c = ctx();
    now = new Date(2026, 9, 2, 9, 0); // earlier this month, a different week
    recordUsage(c, 'chat', 'claude-opus-5-5', usage({ inputTokens: 1_000_000 })); // $4
    now = new Date(2026, 9, 12, 9, 0); // Monday of this week
    recordUsage(c, 'chat', 'claude-opus-5-5', usage({ inputTokens: 500_000 })); // $2
    now = new Date(2026, 9, 14, 9, 0); // today
    recordUsage(c, 'sorter', 'claude-opus-5-5', usage({ inputTokens: 250_000 })); // $1
    now = new Date(2026, 8, 30, 9, 0); // last month
    recordUsage(c, 'chat', 'claude-opus-5-5', usage({ inputTokens: 1_000_000 })); // $4
    now = new Date(2026, 9, 14, 10, 0);
    expect(getSpend(ctx())).toEqual({ today: 1, week: 3, month: 7 });
  });

  it('stores the cache numbers so caching can be checked', () => {
    recordUsage(
      ctx(),
      'chat',
      'claude-opus-5-5',
      usage({ cacheReadTokens: 1234, cacheWriteTokens: 55, inputTokens: 9, outputTokens: 7 }),
    );
    expect(
      db.prepare('SELECT cache_read_tokens AS r, cache_write_tokens AS w FROM api_usage').get(),
    ).toEqual({ r: 1234, w: 55 });
  });

  it('refuses a call once the month is at the cap, and not before', () => {
    recordUsage(ctx(), 'chat', 'claude-opus-5-5', usage({ inputTokens: 1_000_000 })); // $4
    expect(() => assertUnderCap(ctx(), 5)).not.toThrow();
    expect(() => assertUnderCap(ctx(), 4)).toThrowError(AtlasError);
    expect(() => assertUnderCap(ctx(), 4)).toThrow(/spending cap/);
  });

  it('has no cap unless one is set, and a cap of 0 blocks everything', () => {
    expect(() => assertUnderCap(ctx(), 0)).toThrowError(AtlasError);
    recordUsage(ctx(), 'chat', 'claude-opus-5-5', usage({ inputTokens: 100_000_000 }));
    expect(() => assertUnderCap(ctx(), null)).not.toThrow();
  });
});

describe('the API key store', () => {
  let dir: string;
  beforeEach(() => {
    dir = mkdtempSync(join(tmpdir(), 'cortex-secret-'));
  });
  afterEach(() => rmSync(dir, { recursive: true, force: true }));

  // A reversible stand-in for the operating system's key store.
  const cipher = (available = true) => ({
    isEncryptionAvailable: () => available,
    encryptString: (s: string) => Buffer.from(`enc:${Buffer.from(s).toString('hex')}`),
    decryptString: (b: Buffer) => Buffer.from(b.toString().replace('enc:', ''), 'hex').toString(),
  });
  const KEY = 'sk-ant-api03-abcdefghijklmnopqrstuvwxyz0123456789';

  it('keeps the key encrypted on disk, and reads it back', () => {
    const path = join(dir, 'secrets.json');
    const store = createFileSecretStore(path, cipher());
    expect(store.get()).toBeNull();
    store.set(KEY);
    expect(store.get()).toBe(KEY);
    // The key itself is nowhere in the file.
    expect(readFileSync(path, 'utf8')).not.toContain('sk-ant');
    expect(readFileSync(path, 'utf8')).not.toContain(KEY);
  });

  it('forgets the key when cleared', () => {
    const store = createFileSecretStore(join(dir, 's.json'), cipher());
    store.set(KEY);
    store.clear();
    expect(store.get()).toBeNull();
  });

  it('refuses to save a key where it cannot be encrypted', () => {
    const store = createFileSecretStore(join(dir, 's.json'), cipher(false));
    expect(store.available()).toBe(false);
    expect(() => store.set(KEY)).toThrow(/securely/);
  });

  it('treats an unreadable file as no key', () => {
    const path = join(dir, 's.json');
    writeFileSync(path, 'not json');
    expect(createFileSecretStore(path, cipher()).get()).toBeNull();
  });

  it('recognises the shape of an Anthropic key and nothing else', () => {
    expect(looksLikeAnthropicKey(KEY)).toBe(true);
    expect(looksLikeAnthropicKey(`  ${KEY}  `)).toBe(true);
    expect(looksLikeAnthropicKey('hunter2')).toBe(false);
    expect(looksLikeAnthropicKey('sk-proj-abcdefghijklmnopqrstuvwxyz')).toBe(false);
  });

  it('has an in-memory store for tests', () => {
    const s = createMemorySecretStore();
    s.set(` ${KEY} `);
    expect(s.get()).toBe(KEY);
  });
});

describe('error messages', () => {
  const make = (status: number) =>
    Anthropic.APIError.generate(
      status,
      { type: 'error', error: { type: 'x', message: 'nope' } },
      'nope',
      new Headers(),
    );

  it('says what to do for each kind of problem', () => {
    expect(describeError(make(401)).kind).toBe('bad-key');
    expect(describeError(make(403)).kind).toBe('bad-key');
    expect(describeError(make(400)).kind).toBe('invalid');
    expect(describeError(make(429)).message).toMatch(/Atlas is unavailable/);
    expect(describeError(make(500)).kind).toBe('unavailable');
    expect(describeError(new Anthropic.APIConnectionError({ message: 'down' })).message).toMatch(
      /could not reach/,
    );
    expect(describeError(new Error('boom')).kind).toBe('unavailable');
  });

  it('passes an Atlas error through untouched', () => {
    const e = new AtlasError('x', 'cap');
    expect(describeError(e)).toBe(e);
  });
});
