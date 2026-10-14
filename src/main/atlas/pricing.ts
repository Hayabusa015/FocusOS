import type { AtlasModel } from '@shared/atlas';

/**
 * What a call costs, estimated from published prices. This is the only place a price is written
 * (CLAUDE.md rule 3). Prices change: update the table and `PRICES_CHECKED` together.
 *
 * Dollars per million tokens. Cache writes (5 minute) cost 1.25x the input price; cache reads are
 * the discounted rate listed for each model.
 */
export const PRICES_CHECKED = '2026-10-14';
export const PRICES_SOURCE = 'Anthropic model pricing (platform.claude.com), checked 2026-10-14';

interface Price {
  input: number;
  output: number;
  cacheRead: number;
  /** Haiku 5.5 charges more for a prompt over 100K tokens. */
  longPrompt?: { over: number; input: number; output: number; cacheRead: number };
}

export const PRICES: Record<AtlasModel, Price> = {
  'claude-opus-5-5': { input: 4, output: 20, cacheRead: 0.2 },
  'claude-sonnet-5-5': { input: 2, output: 10, cacheRead: 0.2 },
  'claude-haiku-5-5': {
    input: 0.1,
    output: 0.5,
    cacheRead: 0.01,
    longPrompt: { over: 100_000, input: 0.5, output: 2.5, cacheRead: 0.05 },
  },
};

export interface TokenUsage {
  inputTokens: number;
  outputTokens: number;
  cacheReadTokens: number;
  cacheWriteTokens: number;
}

const PER_MILLION = 1_000_000;

/** Estimated dollars for one call. Unknown models cost 0 here, so a new model never breaks a call. */
export function estimateCost(model: string, usage: TokenUsage): number {
  // A model not in the table (a fallback model the server chose) is priced like the dearest one we
  // know, so a spending cap can only over-count, never under-count.
  const price =
    PRICES[model as AtlasModel] ??
    Object.values(PRICES).reduce((a, b) => (b.output > a.output ? b : a));
  const promptTokens = usage.inputTokens + usage.cacheReadTokens + usage.cacheWriteTokens;
  const tier = price.longPrompt && promptTokens > price.longPrompt.over ? price.longPrompt : price;
  const cost =
    (usage.inputTokens * tier.input +
      usage.outputTokens * tier.output +
      usage.cacheReadTokens * tier.cacheRead +
      usage.cacheWriteTokens * tier.input * 1.25) /
    PER_MILLION;
  return Math.round(cost * 1e6) / 1e6;
}
