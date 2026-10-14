import { CHANNELS } from '@shared/channels';
import {
  AtlasKeyInput,
  AtlasSendInput,
  BrainDumpApply,
  BrainDumpInput,
  PlanApply,
  SortApply,
} from '@shared/atlas-modes';
import type { DataChanged } from '@shared/core';
import { EmptyRequest as Empty } from '@shared/schemas';
import type { Atlas } from '../atlas';
import type { Store } from '../db/store';
import { handle } from './handle';
import type { TrustCheck } from './handle';

export interface AtlasIpcDeps {
  atlas: Atlas;
  store: Store;
  isTrustedSender: TrustCheck;
  notifyChanged(change: DataChanged): void;
  /** Pushes a piece of the reply to the renderer. */
  sendChunk(text: string): void;
}

/** Registers the Atlas channels. Every payload is validated before the handler sees it. */
export function registerAtlasIpc(deps: AtlasIpcDeps): void {
  const { atlas, store, isTrustedSender: trust } = deps;

  /** Tells the windows an Atlas change happened, with what it earned (a finished task awards XP). */
  const announce = (change: { logId: string; summary: string }) => {
    const award = store.takeAward();
    deps.notifyChanged({
      logId: change.logId,
      summary: `Atlas: ${change.summary}`,
      ...(award.xp !== 0 ? { xp: award.xp } : {}),
      ...(award.unlocked.length > 0 ? { unlocked: award.unlocked } : {}),
      ...(award.big ? { big: true } : {}),
    });
  };
  /** After a batch the user approved: one notice, and the award. */
  const announceBatch = (result: {
    ok: boolean;
    value?: { logIds: string[]; summary: string };
  }) => {
    if (!result.ok || !result.value) return;
    const award = store.takeAward();
    // No single Undo here: the screen offers "Undo all" for the whole batch.
    deps.notifyChanged({
      logId: null,
      summary: result.value.summary,
      ...(award.xp !== 0 ? { xp: award.xp } : {}),
    });
  };

  handle(CHANNELS.atlasStatus, Empty, () => atlas.status(), trust);
  // Saving or removing the key changes what the panel and Settings show, so tell the windows.
  handle(
    CHANNELS.atlasSetKey,
    AtlasKeyInput,
    async ({ key }) => {
      const result = await atlas.setKey(key);
      if (result.ok) deps.notifyChanged({ logId: null, summary: null });
      return result;
    },
    trust,
  );
  handle(
    CHANNELS.atlasClearKey,
    Empty,
    () => {
      const status = atlas.clearKey();
      deps.notifyChanged({ logId: null, summary: null });
      return status;
    },
    trust,
  );
  handle(CHANNELS.atlasHistory, Empty, () => atlas.history(), trust);
  handle(
    CHANNELS.atlasSend,
    AtlasSendInput,
    async ({ text }) => {
      const result = await atlas.send(text, {
        onText: (delta) => deps.sendChunk(delta),
        onChange: announce,
      });
      // Spend changed even when the call failed part-way, so tell the windows either way.
      deps.notifyChanged({ logId: null, summary: null });
      return result;
    },
    trust,
  );
  handle(CHANNELS.atlasChanges, Empty, () => atlas.changes(), trust);
  handle(CHANNELS.atlasSort, Empty, () => atlas.sort(), trust);
  handle(
    CHANNELS.atlasSortApply,
    SortApply,
    async (p) => {
      const result = await atlas.applySort(p);
      announceBatch(result);
      return result;
    },
    trust,
  );
  handle(CHANNELS.atlasPlan, Empty, () => atlas.plan(), trust);
  handle(
    CHANNELS.atlasPlanApply,
    PlanApply,
    async (p) => {
      const result = await atlas.applyPlan(p);
      announceBatch(result);
      return result;
    },
    trust,
  );
  handle(CHANNELS.atlasDump, BrainDumpInput, ({ text }) => atlas.brainDump(text), trust);
  handle(
    CHANNELS.atlasDumpApply,
    BrainDumpApply,
    async (p) => {
      const result = await atlas.applyBrainDump(p);
      announceBatch(result);
      return result;
    },
    trust,
  );
}
