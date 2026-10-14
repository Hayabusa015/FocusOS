import Anthropic from '@anthropic-ai/sdk';
import type { BetaMessage } from '@anthropic-ai/sdk/resources/beta/messages/messages';
import { resolveRoute } from '@shared/atlas';
import type { AtlasEffort, AtlasModel, AtlasRoute } from '@shared/atlas';
import type { AppSettings } from '@shared/core';
import type { Store } from '../db/store';
import type { DayWindow } from '../db/views';
import { AtlasError, noKey } from './errors';
import type { SecretStore } from './secrets';
import { assertUnderCap, recordUsage } from './usage';

/**
 * What every Atlas call needs. The Anthropic client is made through `createClient` so tests can
 * hand in one that talks to a scripted fake instead of the network.
 */
export interface AtlasDeps {
  store: Store;
  secrets: SecretStore;
  settings: () => AppSettings;
  createClient?: (apiKey: string) => Anthropic;
}

export const dayWindowOf = (settings: AppSettings): DayWindow => ({
  dayStart: settings.dayStart,
  dayEnd: settings.dayEnd,
});

/** A client for the saved key. No key means no call: the caller shows the message. */
export function clientFor(deps: AtlasDeps): Anthropic {
  const key = deps.secrets.get();
  if (!key) throw noKey();
  return (
    deps.createClient?.(key) ??
    // Retries are the SDK's own (2 by default); a long ramble can take a while, hence the timeout.
    new Anthropic({ apiKey: key, maxRetries: 2, timeout: 120_000 })
  );
}

export interface RouteParams {
  model: AtlasModel;
  effort: AtlasEffort;
  /** Opus 5.5 and Sonnet 5.5 get the server-side fallback (PLAN §7.2). */
  fallbacks: boolean;
}

export function routeParams(deps: AtlasDeps, route: AtlasRoute): RouteParams {
  const { model, effort } = resolveRoute(route, deps.settings().atlasRoutes);
  return { model, effort, fallbacks: model !== 'claude-haiku-5-5' };
}

/** The beta header that enables `fallbacks: "default"`. */
export const FALLBACK_BETA = 'server-side-fallback-2026-07-01';

/** Refuses the call when this month's cap is reached (PLAN §7.7). */
export function checkCap(deps: AtlasDeps): void {
  assertUnderCap(deps.store.ctx, deps.settings().atlasMonthlyCapUsd);
}

/**
 * Writes the cost-ledger rows for one response. A response served by a fallback model reports that
 * attempt separately in `usage.iterations`; it is recorded under its own model. If the API already
 * folds it into the top-level counts this over-estimates, which is the safe side for a spending cap.
 */
export function recordMessageUsage(deps: AtlasDeps, route: AtlasRoute, message: BetaMessage): void {
  const ctx = deps.store.ctx;
  const u = message.usage;
  recordUsage(ctx, route, message.model, {
    inputTokens: u.input_tokens ?? 0,
    outputTokens: u.output_tokens ?? 0,
    cacheReadTokens: u.cache_read_input_tokens ?? 0,
    cacheWriteTokens: u.cache_creation_input_tokens ?? 0,
  });
  for (const it of u.iterations ?? []) {
    if (it.type !== 'fallback_message') continue;
    recordUsage(ctx, route, it.model, {
      inputTokens: it.input_tokens,
      outputTokens: it.output_tokens,
      cacheReadTokens: it.cache_read_input_tokens,
      cacheWriteTokens: it.cache_creation_input_tokens,
    });
  }
}

/** The text of a finished response, joined. */
export function textOf(message: BetaMessage): string {
  return message.content
    .filter((b): b is Extract<typeof b, { type: 'text' }> => b.type === 'text')
    .map((b) => b.text)
    .join('')
    .trim();
}

export const REFUSAL_MESSAGE = 'Atlas cannot help with that one. Nothing was changed.';

/** Throws a plain error for a response that cannot be used. */
export function assertUsable(message: BetaMessage): void {
  if (message.stop_reason === 'refusal') throw new AtlasError(REFUSAL_MESSAGE, 'refused');
  if (message.stop_reason === 'max_tokens')
    throw new AtlasError(
      'Atlas ran out of room for that answer. Try a smaller request.',
      'invalid',
    );
}
