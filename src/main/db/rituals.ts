import { addDays, minutesOfDay, toLocalTime } from '@shared/dates';
import type { BriefingView, RitualState, ShutdownView, Task } from '@shared/core';
import {
  getFlag,
  inboxCount,
  recordShutdown,
  setFlag,
  shutdownDone,
  winsOn,
  xpToday,
} from './ledger';
import type { Ctx } from './context';
import { listMaintenance } from './maintenance';
import { listBlocksOn, listCarryForward, listDueOn, listUndatedOpen } from './tasks';

/** The briefing is offered from this time of day. */
export const BRIEFING_FROM = '05:00';

const briefingKey = (date: string) => `ritual.briefing.${date}`;

export function ritualState(ctx: Ctx, options: { briefingEnabled: boolean }): RitualState {
  const today = ctx.today();
  const late = minutesOfDay(toLocalTime(ctx.now())) >= minutesOfDay(BRIEFING_FROM);
  return {
    briefingDue: options.briefingEnabled && late && !getFlag(ctx, briefingKey(today)),
    shutdownDoneToday: shutdownDone(ctx, today),
  };
}

/** Whether the briefing has been shown today, shown or dismissed. */
export function markBriefingShown(ctx: Ctx): void {
  setFlag(ctx, briefingKey(ctx.today()));
}

/** Everything the morning briefing shows, from local data only. */
export function briefingView(ctx: Ctx): BriefingView {
  const today = ctx.today();
  const dueToday = listDueOn(ctx, today);
  const carryForward = listCarryForward(ctx, today);
  const picks: Task[] = [];
  for (const t of [...dueToday, ...carryForward, ...listUndatedOpen(ctx, 3)]) {
    if (picks.length < 3 && !picks.some((p) => p.id === t.id)) picks.push(t);
  }
  return {
    date: today,
    dueToday,
    carryForward,
    maintenance: listMaintenance(ctx).filter(
      (m) => m.state === 'overdue' || m.state === 'due-soon',
    ),
    inbox: inboxCount(ctx),
    picks,
  };
}

function unfinishedToday(ctx: Ctx): Task[] {
  const today = ctx.today();
  const seen = new Map<string, Task>();
  for (const t of [...listDueOn(ctx, today), ...listBlocksOn(ctx, today)]) {
    if (t.status !== 'done' && t.status !== 'someday') seen.set(t.id, t);
  }
  return [...seen.values()];
}

export function shutdownView(ctx: Ctx): ShutdownView {
  const today = ctx.today();
  const tomorrowDate = addDays(today, 1);
  return {
    date: today,
    wins: winsOn(ctx, today),
    xpToday: xpToday(ctx),
    unfinished: unfinishedToday(ctx),
    inbox: inboxCount(ctx),
    tomorrowDate,
    tomorrow: listDueOn(ctx, tomorrowDate).slice(0, 3),
    doneToday: shutdownDone(ctx, today),
  };
}

/**
 * Closes the day. It refuses while anything dated today is still open: the ritual's promise is
 * that nothing is left hanging. Earns 10 XP, once a day.
 */
export function completeShutdown(ctx: Ctx): { xp: number } {
  const open = unfinishedToday(ctx).length;
  if (open > 0) {
    throw new Error(
      `${open === 1 ? 'One task is' : `${open} tasks are`} still open today. Move or finish ${open === 1 ? 'it' : 'them'} first.`,
    );
  }
  return { xp: recordShutdown(ctx) };
}
