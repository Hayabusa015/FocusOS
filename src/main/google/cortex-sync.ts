import type { EventDraft, RemoteEvent } from './types';

/**
 * Keeping the "Cortex" calendar and the tasks' time blocks in step (PLAN §9.3), as a pure
 * decision: what to create, change and remove in Google, and what to pull back into Cortex.
 *
 * It is level-triggered, not event-triggered: it compares what the tasks say with what Google says
 * and with what was true at the last sync, so running it twice in a row is a no-op and no change
 * can bounce between the two sides.
 */
export interface BlockTask {
  id: string;
  title: string;
  status: string;
  /** The block's start, a UTC instant, and its length. */
  startIso: string;
  minutes: number;
  /** When the task last changed in Cortex. */
  updatedAt: string;
}

/** What Cortex remembers about one mirrored event from the last sync. */
export interface Mirror {
  googleId: string;
  etag: string | null;
  syncedAt: string;
}

export interface SyncPlan {
  insert: { taskId: string; draft: EventDraft }[];
  patch: { taskId: string; eventId: string; draft: EventDraft }[];
  /** Events in the Cortex calendar that Cortex made and no longer wants. */
  remove: { eventId: string }[];
  /** Google moved the event more recently: the task's block follows. */
  pull: { taskId: string; startIso: string; minutes: number }[];
  /** Google deleted the event: the task's block is cleared. */
  clearBlock: { taskId: string }[];
  /** Mirror rows with nothing left to mirror. */
  dropRows: { googleId: string }[];
}

const ms = (iso: string) => new Date(iso).getTime();
const endIso = (t: Pick<BlockTask, 'startIso' | 'minutes'>) =>
  new Date(ms(t.startIso) + t.minutes * 60_000).toISOString();

export const draftOf = (t: BlockTask): EventDraft => ({
  title: t.title,
  start: new Date(ms(t.startIso)).toISOString(),
  end: endIso(t),
  cortexTaskId: t.id,
});

/** A block must be 5 minutes to 12 hours long to be a task block (the Block schema). */
const usableLength = (minutes: number) =>
  Number.isInteger(minutes) && minutes >= 5 && minutes <= 720;

export function planCortexSync(input: {
  tasks: BlockTask[];
  mirrors: Map<string, Mirror>;
  remote: RemoteEvent[];
}): SyncPlan {
  const plan: SyncPlan = {
    insert: [],
    patch: [],
    remove: [],
    pull: [],
    clearBlock: [],
    dropRows: [],
  };
  const wanted = new Map(input.tasks.map((t) => [t.id, t]));

  // Events Cortex made: one per task. A duplicate (a retry that half-worked) is removed.
  const byTask = new Map<string, RemoteEvent>();
  for (const e of input.remote) {
    if (!e.cortexTaskId) continue; // Added by hand in the Cortex calendar: left alone.
    if (!wanted.has(e.cortexTaskId)) {
      plan.remove.push({ eventId: e.id });
      continue;
    }
    if (byTask.has(e.cortexTaskId)) plan.remove.push({ eventId: e.id });
    else byTask.set(e.cortexTaskId, e);
  }

  for (const task of input.tasks) {
    const event = byTask.get(task.id);
    const row = input.mirrors.get(task.id);
    const done = task.status === 'done';

    if (!event) {
      if (row) {
        // It was mirrored and is now gone: deleted in Google. The block follows, unless the task
        // is already finished (then there is nothing left to schedule).
        plan.dropRows.push({ googleId: row.googleId });
        if (!done) plan.clearBlock.push({ taskId: task.id });
      } else if (!done) {
        plan.insert.push({ taskId: task.id, draft: draftOf(task) });
      }
      continue;
    }

    const draft = draftOf(task);
    const sameTime =
      !event.allDay && ms(event.start) === ms(draft.start) && ms(event.end) === ms(draft.end);
    const sameTitle = event.title === task.title;
    if (done || (sameTime && sameTitle)) continue; // Nothing to do (the cache refresh keeps the etag).

    const remoteChanged = !row || row.etag !== event.etag;
    const localChanged = !row || task.updatedAt > row.syncedAt;
    const remoteLength = Math.round((ms(event.end) - ms(event.start)) / 60_000);
    const canPull = !event.allDay && !sameTime && usableLength(remoteLength);

    // Both sides moved: the newer one wins. A side that did not move never wins by default.
    const remoteWins =
      canPull && remoteChanged && (!localChanged || event.updated > task.updatedAt);

    if (remoteWins) {
      plan.pull.push({ taskId: task.id, startIso: event.start, minutes: remoteLength });
    } else {
      plan.patch.push({ taskId: task.id, eventId: event.id, draft });
    }
  }
  return plan;
}
