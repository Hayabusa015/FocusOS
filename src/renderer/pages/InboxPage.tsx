import { useCallback, useState } from 'react';
import type { Task } from '@shared/core';
import { BrainDumpDialog } from '@/components/atlas/BrainDumpDialog';
import { SortDialog } from '@/components/atlas/SortDialog';
import { ErrorNote, buttonQuiet } from '@/components/ui';
import { TaskList } from '@/components/TaskList';
import { errorMessage, useLive } from '@/hooks/useLive';
import { areaColor } from '@/lib/areas';
import type { PageProps } from './types';

/** Everything captured and not yet sorted. Pick an area, or press its number, to file it. */
export function InboxPage({ areas, openTask, newTask }: PageProps) {
  const load = useCallback(() => window.cortex.tasks.list({ view: 'inbox' }), []);
  const { data: tasks, error } = useLive(load);
  const [actionError, setActionError] = useState<string | null>(null);
  const [dialog, setDialog] = useState<'sort' | 'dump' | null>(null);

  const update = (task: Task, patch: { areaId?: string; status?: 'someday' }) => {
    setActionError(null);
    window.cortex.tasks
      .update({ id: task.id, ...patch })
      .catch((e: unknown) => setActionError(errorMessage(e)));
  };

  return (
    <div>
      <header className="mb-6 flex items-start justify-between gap-4">
        <div>
          <h1 className="text-4xl font-bold tracking-tight">Inbox</h1>
          <p className="mt-1 text-ink-muted">
            Anything you capture lands here. Pick an area, or press its number, to file it.
          </p>
        </div>
        <span className="flex gap-2">
          <button
            className={buttonQuiet}
            disabled={!tasks || tasks.length === 0}
            onClick={() => setDialog('sort')}
          >
            Sort with Atlas
          </button>
          <button className={buttonQuiet} onClick={() => setDialog('dump')}>
            Brain dump
          </button>
          <button className={buttonQuiet} onClick={() => newTask()}>
            Add task
          </button>
        </span>
      </header>
      {dialog === 'sort' && <SortDialog areas={areas} onClose={() => setDialog(null)} />}
      {dialog === 'dump' && <BrainDumpDialog areas={areas} onClose={() => setDialog(null)} />}
      <ErrorNote message={error ?? actionError} />
      {tasks && (
        <TaskList
          tasks={tasks}
          areas={areas}
          showArea={false}
          trailingBelow
          onOpen={openTask}
          onError={setActionError}
          emptyText="Inbox is empty. Nothing waiting to be sorted. Nicely done."
          onTaskKey={(task, event) => {
            const target = areas[Number(event.key) - 1];
            if (target) update(task, { areaId: target.id });
          }}
          trailing={(task) => (
            <span className="flex flex-wrap justify-end gap-1">
              <button
                title="Park it for later"
                className="rounded-lg border border-line bg-surface px-2 py-1 text-xs text-ink-muted hover:text-ink"
                onClick={() => update(task, { status: 'someday' })}
              >
                Someday
              </button>
              {areas.map((a, i) => (
                <button
                  key={a.id}
                  title={`${a.name} (${i + 1})`}
                  aria-label={`File in ${a.name}`}
                  className="flex items-center gap-1 rounded-lg border border-line bg-surface px-2 py-1 text-xs text-ink-muted hover:text-ink"
                  onClick={() => update(task, { areaId: a.id })}
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
          )}
        />
      )}
    </div>
  );
}
