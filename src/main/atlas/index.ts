import { getSpend, recentUsage } from './usage';
import { PRICES_CHECKED } from './pricing';
import { createChat } from './chat';
import type { ChatHooks } from './chat';
import type { AtlasDeps } from './engine';
import { AtlasError, describeError } from './errors';
import { addBrainDump, brainDump } from './modes/scribe';
import { applyPlan, planRestOfToday } from './modes/planner';
import { applySort, sortInbox } from './modes/sorter';
import { looksLikeAnthropicKey } from './secrets';
import type {
  ApplyOutcome,
  AtlasChangeView,
  AtlasOutcome,
  AtlasReply,
  AtlasStatus,
  BrainDumpApply,
  BrainDumpResult,
  ChatLineView,
  PlanApply,
  PlanResult,
  SortApply,
  SortResult,
} from '@shared/atlas-modes';

/** Runs an Atlas action and turns any problem into a sentence for the screen. */
async function outcome<T>(fn: () => Promise<T> | T): Promise<AtlasOutcome<T>> {
  try {
    return { ok: true, value: await fn() };
  } catch (error) {
    const e = describeError(error);
    return { ok: false, error: e.message, kind: e.kind };
  }
}

/**
 * Everything Atlas does, in one object for the IPC layer. Nothing here is reachable without a
 * button press or a chat message from the user, and the app works fully when none of it is used.
 */
export function createAtlas(deps: AtlasDeps) {
  const chat = createChat(deps);
  const { store, secrets } = deps;

  const status = (): AtlasStatus => ({
    hasKey: secrets.get() !== null,
    canStoreKey: secrets.available(),
    spend: getSpend(store.ctx),
    capUsd: deps.settings().atlasMonthlyCapUsd,
    recent: recentUsage(store.ctx, 5).map((u) => ({
      route: u.route,
      model: u.model,
      cacheReadTokens: u.cacheReadTokens,
      inputTokens: u.inputTokens,
      estCostUsd: u.estCostUsd,
    })),
    pricesChecked: PRICES_CHECKED,
  });

  return {
    status,
    setKey: (key: string) =>
      outcome(() => {
        const trimmed = key.trim();
        if (!looksLikeAnthropicKey(trimmed))
          throw new AtlasError(
            'That does not look like an Anthropic API key (it starts with sk-ant-).',
            'invalid',
          );
        if (!secrets.available())
          throw new AtlasError(
            'This computer cannot protect a stored key, so Cortex will not save one.',
            'invalid',
          );
        secrets.set(trimmed);
        return status();
      }),
    clearKey: (): AtlasStatus => {
      secrets.clear();
      return status();
    },
    history: (): ChatLineView[] => chat.history(),
    send: (text: string, hooks?: ChatHooks): Promise<AtlasOutcome<AtlasReply>> =>
      outcome(() => chat.send(text, hooks)),
    changes: (): AtlasChangeView[] =>
      store.listAtlasChanges().map((e) => ({
        id: e.id,
        summary: e.summary,
        createdAt: e.createdAt,
        undone: e.undone,
      })),
    sort: (): Promise<AtlasOutcome<SortResult>> => outcome(() => sortInbox(deps)),
    applySort: (items: SortApply): Promise<AtlasOutcome<ApplyOutcome>> =>
      outcome(() => applySort(deps, items)),
    plan: (): Promise<AtlasOutcome<PlanResult>> => outcome(() => planRestOfToday(deps)),
    applyPlan: (blocks: PlanApply): Promise<AtlasOutcome<ApplyOutcome>> =>
      outcome(() => applyPlan(deps, blocks)),
    brainDump: (text: string): Promise<AtlasOutcome<BrainDumpResult>> =>
      outcome(() => brainDump(deps, text)),
    applyBrainDump: (tasks: BrainDumpApply): Promise<AtlasOutcome<ApplyOutcome>> =>
      outcome(() => addBrainDump(deps, tasks)),
  };
}
export type Atlas = ReturnType<typeof createAtlas>;
