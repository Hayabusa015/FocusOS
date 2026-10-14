import { localToIso, startOfWeek } from '@shared/dates';
import type { LocalDate } from '@shared/dates';
import type { AtlasRoute } from '@shared/atlas';
import { all, int, one, run, str } from '../db/context';
import type { Ctx } from '../db/context';
import { capReached } from './errors';
import { estimateCost } from './pricing';
import type { TokenUsage } from './pricing';

/** Records one call in the cost ledger (PLAN §7.7). Returns the estimated cost in dollars. */
export function recordUsage(ctx: Ctx, route: AtlasRoute, model: string, usage: TokenUsage): number {
  const cost = estimateCost(model, usage);
  const stamp = ctx.nowIso();
  run(
    ctx,
    `INSERT INTO api_usage (id, route, model, input_tokens, output_tokens, cache_read_tokens,
       cache_write_tokens, est_cost_usd, created_at, updated_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    ctx.newId(),
    route,
    model,
    usage.inputTokens,
    usage.outputTokens,
    usage.cacheReadTokens,
    usage.cacheWriteTokens,
    cost,
    stamp,
    stamp,
  );
  return cost;
}

const spentSince = (ctx: Ctx, fromIso: string): number =>
  Number(
    one(
      ctx,
      'SELECT COALESCE(SUM(est_cost_usd), 0) AS s FROM api_usage WHERE created_at >= ?',
      fromIso,
    )?.['s'] ?? 0,
  );

export interface Spend {
  today: number;
  week: number;
  month: number;
}

/** Spend today, this week (from Monday) and this calendar month, in the user's time zone. */
export function getSpend(ctx: Ctx): Spend {
  const today: LocalDate = ctx.today();
  const monthStart = `${today.slice(0, 7)}-01`;
  return {
    today: spentSince(ctx, localToIso(today, '00:00')),
    week: spentSince(ctx, localToIso(startOfWeek(today), '00:00')),
    month: spentSince(ctx, localToIso(monthStart, '00:00')),
  };
}

/** Refuses an Atlas call once this month's spend has reached the cap. A missing cap means none. */
export function assertUnderCap(ctx: Ctx, capUsd: number | null): void {
  if (capUsd === null || capUsd <= 0) return;
  const spent = getSpend(ctx).month;
  if (spent >= capUsd) throw capReached(spent, capUsd);
}

/** Cache reads and the total of the latest calls, for the panel's "is caching working" line. */
export function recentUsage(ctx: Ctx, limit = 10) {
  return all(ctx, 'SELECT * FROM api_usage ORDER BY created_at DESC, id DESC LIMIT ?', limit).map(
    (r) => ({
      route: str(r, 'route'),
      model: str(r, 'model'),
      inputTokens: int(r, 'input_tokens'),
      outputTokens: int(r, 'output_tokens'),
      cacheReadTokens: int(r, 'cache_read_tokens'),
      cacheWriteTokens: int(r, 'cache_write_tokens'),
      estCostUsd: Number(r['est_cost_usd'] ?? 0),
      createdAt: str(r, 'created_at'),
    }),
  );
}
