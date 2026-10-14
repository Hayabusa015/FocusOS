import { useCallback, useState } from 'react';
import type { Task } from '@shared/core';
import { Empty, ErrorNote, buttonQuiet } from '@/components/ui';
import { TaskRow } from '@/components/TaskRow';
import { errorMessage, useLive } from '@/hooks/useLive';
import { toggleTask } from '@/lib/actions';
import { areaColor } from '@/lib/areas';
import type { PageProps } from './types';

/** Everything captured and not yet sorted. Press a number on a task to file it in that area. */
export function InboxPage({ areas, openTask, newTask }: PageProps) {
  const load = useCallback(() => window.cortex.tasks.list({ view: 'inbox' }), []);
  const { data: tasks, error } = useLive(load);
  const [actionError, setActionError] = useState<string | null>(null);

  const file = (task: Task, areaId: string) => {
    setActionError(null);
    window.cortex.tasks
      .update({ id: task.id, areaId })
      .catch((e: unknown) => setActionError(errorMessage(e)));
  };

  return (
    <div>
      <header className="mb-6 flex items-start justify-between gap-4">
        <div>
          <h1 className="text-3xl font-semibold tracking-tight">Inbox</h1>
          <p className="mt-1 text-ink-muted">
            Anything you capture lands here. Pick an area, or press its number, to file it.
          </p>
        </div>
        <button className={buttonQuiet} onClick={() => newTask()}>
          Add task
        </button>
      </header>
      <ErrorNote message={error ?? actionError} />
      {tasks && tasks.length === 0 && (
        <Empty title="Inbox is empty">Nothing waiting to be sorted. Nicely done.</Empty>
      )}
      <ul>
        {(tasks ?? []).map((task) => (
          <TaskRow
            key={task.id}
            task={task}
            area={null}
            showArea={false}
            onOpen={(t) => openTask(t.id)}
            onToggle={(t) => {
              setActionError(null);
              toggleTask(t).catch((e: unknown) => setActionError(errorMessage(e)));
            }}
            onKeyDown={(event) => {
              const n = Number(event.key);
              const target = areas[n - 1];
              if (
                n >= 1 &&
                target &&
                event.target instanceof HTMLElement &&
                event.target.tagName !== 'INPUT'
              ) {
                file(task, target.id);
              }
            }}
            trailing={
              <span className="flex flex-wrap justify-end gap-1">
                <button
                  title="Park it for later"
                  className="rounded-lg border border-line px-2 py-1 text-xs text-ink-muted hover:text-ink"
                  onClick={() => {
                    setActionError(null);
                    window.cortex.tasks
                      .update({ id: task.id, status: 'someday' })
                      .catch((e: unknown) => setActionError(errorMessage(e)));
                  }}
                >
                  Someday
                </button>
                {areas.map((a, i) => (
                  <button
                    key={a.id}
                    title={`${a.name} (${i + 1})`}
                    aria-label={`File in ${a.name}`}
                    className="flex items-center gap-1 rounded-lg border border-line px-2 py-1 text-xs text-ink-muted hover:text-ink"
                    onClick={() => file(task, a.id)}
                  >
                    <span
                      aria-hidden
                      className="inline-block size-2 rounded-full"
                      style={{ background: areaColor(a) }}
                    />
                    {a.name}
                  </button>
                ))}
              </span>
            }
          />
        ))}
      </ul>
    </div>
  );
}
