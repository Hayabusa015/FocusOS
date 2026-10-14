import { useCallback, useState } from 'react';
import type { Task } from '@shared/core';
import { Card, Empty, ErrorNote, SectionTitle, buttonQuiet, AreaDot } from '@/components/ui';
import { TaskRow } from '@/components/TaskRow';
import { useLive, errorMessage } from '@/hooks/useLive';
import { toggleTask } from '@/lib/actions';
import { indexAreas } from '@/lib/areas';
import { minutesText, timeOfIso } from '@/lib/dates';
import { greeting } from '@/lib/format';
import type { PageProps } from './types';

export function TodayPage({ areas, openTask, newTask }: PageProps) {
  const load = useCallback(() => window.cortex.today.get(), []);
  const { data: today, error } = useLive(load, 30_000);
  const [actionError, setActionError] = useState<string | null>(null);
  const byId = indexAreas(areas);
  const now = new Date();

  const run = (action: () => Promise<unknown>) => {
    setActionError(null);
    action().catch((e: unknown) => setActionError(errorMessage(e)));
  };
  const onToggle = (task: Task) => run(() => toggleTask(task));

  const dateText = now.toLocaleDateString([], { weekday: 'long', month: 'long', day: 'numeric' });
  const nothing =
    today &&
    today.blocks.length === 0 &&
    today.dueToday.length === 0 &&
    today.carryForward.length === 0;

  return (
    <div>
      <header className="mb-6 flex items-start justify-between gap-4">
        <div>
          <h1 className="text-3xl font-semibold tracking-tight">{greeting(now)}</h1>
          <p className="mt-1 text-ink-muted">{dateText}</p>
        </div>
        <button className={buttonQuiet} onClick={() => newTask()}>
          Add task
        </button>
      </header>
      <ErrorNote message={error ?? actionError} />

      {today && (
        <>
          <Card label="Now and next" className="mb-4">
            {today.nowBlock ? (
              <p data-testid="now-bar">
                <span className="text-xs font-semibold uppercase tracking-wide text-accent-soft">
                  Now
                </span>
                <span className="ml-3 text-lg font-medium">{today.nowBlock.title}</span>
                <span className="ml-3 text-sm text-ink-muted">
                  {minutesText(today.nowBlock.minutesLeft)} left
                </span>
              </p>
            ) : (
              <p className="text-ink-muted" data-testid="now-bar">
                Nothing scheduled right now.
              </p>
            )}
            {today.nextBlock && (
              <p className="mt-2 text-sm text-ink-muted" data-testid="next-bar">
                <span className="text-xs font-semibold uppercase tracking-wide">Next</span>
                <span className="ml-3 text-ink">{today.nextBlock.title}</span>
                <span className="ml-3">in {minutesText(today.nextBlock.startsInMinutes)}</span>
              </p>
            )}
          </Card>

          <Card label="Your day" className="mb-6">
            <div
              role="progressbar"
              aria-label="How much of your day has passed"
              aria-valuemin={0}
              aria-valuemax={100}
              aria-valuenow={Math.round(today.arc.fraction * 100)}
              className="h-2 overflow-hidden rounded-full bg-raised"
            >
              <div
                className="h-full rounded-full bg-accent"
                style={{ width: `${today.arc.fraction * 100}%` }}
              />
            </div>
            <div className="mt-3 flex flex-wrap items-center justify-between gap-2 text-sm text-ink-muted">
              <span>
                {today.arc.phase === 'before' && `Your day starts at ${today.dayStart}.`}
                {today.arc.phase === 'during' &&
                  `${minutesText(today.arc.minutesLeft)} left in your day.`}
                {today.arc.phase === 'after' && 'The day is done. Anything left can wait.'}
              </span>
              <span data-testid="counters">
                <span className="text-win">{today.counters.tasksDone}</span> of{' '}
                {today.counters.tasksTotal} tasks done
                {today.counters.blocksTotal > 0 &&
                  ` · ${today.counters.blocksDone} of ${today.counters.blocksTotal} blocks`}
              </span>
            </div>
          </Card>

          {nothing && (
            <Empty title="Nothing planned for today">
              Press Add task, or use the capture shortcut from anywhere to drop a thought into your
              Inbox.
            </Empty>
          )}

          {today.blocks.length > 0 && (
            <section aria-label="Timeline" className="mb-6">
              <SectionTitle>Timeline</SectionTitle>
              <ol className="space-y-1">
                {today.blocks.map((b) => (
                  <li
                    key={b.taskId}
                    className="flex items-center gap-3 rounded-lg px-2 py-2 hover:bg-raised"
                  >
                    <span className="w-28 shrink-0 text-xs tabular-nums text-ink-muted">
                      {timeOfIso(b.start)} – {timeOfIso(b.end)}
                    </span>
                    <AreaDot area={b.areaId ? byId.get(b.areaId) : null} />
                    <button
                      className={`min-w-0 flex-1 truncate text-left text-sm ${b.status === 'done' ? 'text-ink-muted line-through' : ''}`}
                      onClick={() => openTask(b.taskId)}
                    >
                      {b.title}
                    </button>
                  </li>
                ))}
              </ol>
            </section>
          )}

          {today.dueToday.length > 0 && (
            <section aria-label="Due today" className="mb-6">
              <SectionTitle>Due today</SectionTitle>
              <ul>
                {today.dueToday.map((t) => (
                  <TaskRow
                    key={t.id}
                    task={t}
                    area={t.areaId ? byId.get(t.areaId) : null}
                    onOpen={(task) => openTask(task.id)}
                    onToggle={onToggle}
                  />
                ))}
              </ul>
            </section>
          )}

          {today.carryForward.length > 0 && (
            <section aria-label="Carried forward" className="mb-6">
              <SectionTitle hint="From earlier days. Move what still matters; the rest can wait.">
                Carried forward
              </SectionTitle>
              <ul>
                {today.carryForward.map((t) => (
                  <TaskRow
                    key={t.id}
                    task={t}
                    area={t.areaId ? byId.get(t.areaId) : null}
                    onOpen={(task) => openTask(task.id)}
                    onToggle={onToggle}
                    trailing={
                      <button
                        className="rounded-lg border border-line px-2 py-1 text-xs text-ink-muted opacity-0 transition-opacity hover:text-ink focus:opacity-100 group-hover:opacity-100"
                        onClick={() => run(() => window.cortex.tasks.reschedule(t.id, today.date))}
                      >
                        Move to today
                      </button>
                    }
                  />
                ))}
              </ul>
            </section>
          )}
        </>
      )}
    </div>
  );
}
