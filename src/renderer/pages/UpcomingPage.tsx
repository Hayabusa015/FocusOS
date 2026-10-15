import { useCallback, useState } from 'react';
import type { Task } from '@shared/core';
import { Empty, ErrorNote, SectionTitle } from '@/components/ui';
import { TaskRow } from '@/components/TaskRow';
import { errorMessage, useLive } from '@/hooks/useLive';
import { toggleTask } from '@/lib/actions';
import { indexAreas } from '@/lib/areas';
import { friendlyDate } from '@/lib/dates';
import type { PageProps } from './types';

export function UpcomingPage({ areas, openTask, go }: PageProps) {
  const load = useCallback(() => window.cortex.upcoming.get(), []);
  const { data, error } = useLive(load);
  const [actionError, setActionError] = useState<string | null>(null);
  const byId = indexAreas(areas);
  const days = (data?.days ?? []).filter((d) => d.tasks.length > 0 || d.maintenance.length > 0);

  const onToggle = (task: Task) => {
    setActionError(null);
    toggleTask(task).catch((e: unknown) => setActionError(errorMessage(e)));
  };

  return (
    <div>
      <header className="mb-6">
        <h1 className="text-4xl font-bold tracking-tight">Upcoming</h1>
        <p className="mt-1 text-ink-muted">The next two weeks, with home maintenance coming due.</p>
      </header>
      <ErrorNote message={error ?? actionError} />
      {data && days.length === 0 && (
        <Empty title="Nothing coming up">
          Tasks with a due date, and maintenance that is coming due, show up here.
        </Empty>
      )}
      {days.map((day) => (
        <section
          key={day.date ?? 'later'}
          aria-label={day.date ? friendlyDate(day.date, data?.today) : 'Later'}
          className="mb-6"
        >
          <SectionTitle>
            {day.date ? friendlyDate(day.date, data?.today) : 'Coming due later'}
          </SectionTitle>
          <ul>
            {day.tasks.map((t) => (
              <TaskRow
                key={t.id}
                task={t}
                area={t.areaId ? byId.get(t.areaId) : null}
                onOpen={(task) => openTask(task.id)}
                onToggle={onToggle}
              />
            ))}
            {day.maintenance.map((m) => (
              <li key={m.id} className="rounded-lg px-2 py-2 hover:bg-raised">
                <button className="w-full text-left" onClick={() => go({ page: 'maintenance' })}>
                  <span className="block text-sm">🛠 {m.name}</span>
                  <span className="text-xs text-ink-muted">{m.statusText}</span>
                </button>
              </li>
            ))}
          </ul>
        </section>
      ))}
    </div>
  );
}
