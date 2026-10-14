import { addDays } from '@shared/dates';
import type {
  BlockView,
  MaintenanceItem,
  SearchResults,
  Task,
  TodayView,
  UpcomingView,
} from '@shared/core';
import { dayArc, nowNext } from '../domain/today';
import type { TimedBlock } from '../domain/today';
import type { Ctx } from './context';
import { winsOn, xpToday } from './ledger';
import { listMaintenance, searchMaintenance } from './maintenance';
import {
  countCompletedOn,
  listCompletedOn,
  listBlocksOn,
  listCarryForward,
  listDueBetween,
  listDueOn,
  searchTasks,
} from './tasks';

const UPCOMING_DAYS = 14;

export interface DayWindow {
  dayStart: string;
  dayEnd: string;
}

function toBlockView(t: Task): BlockView {
  const startMs = new Date(t.scheduledStart as string).getTime();
  return {
    taskId: t.id,
    title: t.title,
    areaId: t.areaId,
    status: t.status,
    start: new Date(startMs).toISOString(),
    end: new Date(startMs + (t.scheduledMinutes ?? 30) * 60_000).toISOString(),
  };
}

/** Everything the Today page shows, in one read (PLAN §10). */
export function getToday(ctx: Ctx, window: DayWindow): TodayView {
  const today = ctx.today();
  const now = ctx.now();
  const blocks = listBlocksOn(ctx, today).map(toBlockView);
  const timed: (BlockView & TimedBlock)[] = blocks.map((b) => ({
    ...b,
    startMs: new Date(b.start).getTime(),
    endMs: new Date(b.end).getTime(),
  }));
  const { now: nowBlock, next: nextBlock } = nowNext(timed, now.getTime());
  const strip = <T extends TimedBlock>(b: T): Omit<T, 'startMs' | 'endMs'> => {
    const { startMs: _s, endMs: _e, ...rest } = b;
    return rest;
  };

  const dueToday = listDueOn(ctx, today);
  const doneToday = countCompletedOn(ctx, today);
  return {
    date: today,
    nowIso: now.toISOString(),
    dayStart: window.dayStart,
    dayEnd: window.dayEnd,
    arc: dayArc(window.dayStart, window.dayEnd, now),
    nowBlock: nowBlock ? strip(nowBlock) : null,
    nextBlock: nextBlock ? strip(nextBlock) : null,
    blocks,
    dueToday,
    doneToday: listCompletedOn(ctx, today),
    carryForward: listCarryForward(ctx, today),
    counters: {
      tasksDone: doneToday,
      tasksTotal: dueToday.length + doneToday,
      winsToday: winsOn(ctx, today).length,
      xpToday: xpToday(ctx),
      blocksDone: blocks.filter((b) => b.status === 'done').length,
      blocksTotal: blocks.length,
    },
  };
}

/**
 * The next 14 days by day, with home maintenance on the day it comes due. An item shows up once it
 * is within its lead time; one due beyond the window goes in a final "later" group.
 */
export function getUpcoming(ctx: Ctx): UpcomingView {
  const today = ctx.today();
  const last = addDays(today, UPCOMING_DAYS - 1);
  const tasks = listDueBetween(ctx, today, last);
  const maintenance = listMaintenance(ctx).filter(
    (m) => m.state === 'overdue' || m.state === 'due-soon',
  );

  const days = Array.from({ length: UPCOMING_DAYS }, (_, i) => {
    const date = addDays(today, i);
    return {
      date: date as string | null,
      tasks: tasks.filter((t) => t.dueDate === date),
      // Something that was due earlier is shown today, so it is not lost.
      maintenance: maintenance.filter((m) =>
        i === 0 ? (m.nextDue as string) <= today : m.nextDue === date,
      ),
    };
  });
  const later = maintenance.filter((m) => (m.nextDue as string) > last);
  const grouped: UpcomingView['days'] = days.filter(
    (d) => d.tasks.length > 0 || d.maintenance.length > 0,
  );
  if (later.length > 0) grouped.push({ date: null, tasks: [], maintenance: later });
  return { today, days: grouped };
}

export function search(ctx: Ctx, query: string): SearchResults {
  return {
    tasks: searchTasks(ctx, query),
    maintenance: searchMaintenance(ctx, query) as MaintenanceItem[],
  };
}
