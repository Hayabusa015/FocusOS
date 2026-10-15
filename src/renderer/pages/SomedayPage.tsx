import { useCallback, useState } from 'react';
import { Empty, ErrorNote } from '@/components/ui';
import { TaskRow } from '@/components/TaskRow';
import { errorMessage, useLive } from '@/hooks/useLive';
import { indexAreas } from '@/lib/areas';
import type { PageProps } from './types';

/** Tasks parked for later. They stay out of every other list until brought back. */
export function SomedayPage({ areas, openTask }: PageProps) {
  const load = useCallback(() => window.cortex.tasks.list({ view: 'someday' }), []);
  const { data: tasks, error } = useLive(load);
  const [actionError, setActionError] = useState<string | null>(null);
  const byId = indexAreas(areas);
  return (
    <div>
      <header className="mb-6">
        <h1 className="text-4xl font-bold tracking-tight">Someday</h1>
        <p className="mt-1 text-ink-muted">Parked for later. Nothing here is waiting on you.</p>
      </header>
      <ErrorNote message={error ?? actionError} />
      {tasks && tasks.length === 0 && (
        <Empty title="Nothing parked">Press Someday on an Inbox task to park it here.</Empty>
      )}
      <ul>
        {(tasks ?? []).map((t) => (
          <TaskRow
            key={t.id}
            task={t}
            area={t.areaId ? byId.get(t.areaId) : null}
            onOpen={(task) => openTask(task.id)}
            onToggle={(task) => {
              setActionError(null);
              window.cortex.tasks
                .complete(task.id)
                .catch((e: unknown) => setActionError(errorMessage(e)));
            }}
            trailing={
              <button
                className="rounded-lg border border-line px-2 py-1 text-xs text-ink-muted hover:text-ink"
                onClick={() => {
                  setActionError(null);
                  window.cortex.tasks
                    .update({ id: t.id, status: t.areaId ? 'todo' : 'inbox' })
                    .catch((e: unknown) => setActionError(errorMessage(e)));
                }}
              >
                Bring back
              </button>
            }
          />
        ))}
      </ul>
    </div>
  );
}
