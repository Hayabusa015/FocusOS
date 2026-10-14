import { useCallback, useState } from 'react';
import type { Task } from '@shared/core';
import { Card, ErrorNote, Ring, SectionTitle, inputClass } from '@/components/ui';
import { TaskList } from '@/components/TaskList';
import { TaskRow } from '@/components/TaskRow';
import { errorMessage, useLive } from '@/hooks/useLive';
import { toggleTask } from '@/lib/actions';
import { areaColor } from '@/lib/areas';
import type { PageProps } from './types';

export function AreaPage({ areas, areaId, openTask }: PageProps & { areaId: string }) {
  const area = areas.find((a) => a.id === areaId) ?? null;
  const load = useCallback(() => window.cortex.tasks.list({ view: 'area', areaId }), [areaId]);
  const { data: tasks, error } = useLive(load);
  const loadUpcoming = useCallback(() => window.cortex.upcoming.get(), []);
  const { data: upcoming } = useLive(loadUpcoming);
  const [title, setTitle] = useState('');
  const [actionError, setActionError] = useState<string | null>(null);

  const run = (action: () => Promise<unknown>) => {
    setActionError(null);
    action().catch((e: unknown) => setActionError(errorMessage(e)));
  };

  const todo = (tasks ?? []).filter((t) => t.status === 'todo' || t.status === 'inbox');
  const doing = (tasks ?? []).filter((t) => t.status === 'doing');
  const done = (tasks ?? []).filter((t) => t.status === 'done');
  const total = todo.length + doing.length + done.length;

  const upcomingHere = (upcoming?.days ?? [])
    .flatMap((d) => d.tasks)
    .filter((t) => t.areaId === areaId && t.status !== 'done');

  if (!area) return <p className="text-ink-muted">That area is not here any more.</p>;

  const column = (heading: string, items: Task[], start?: boolean) => (
    <Card label={heading} className="min-w-0">
      <SectionTitle hint={String(items.length)}>{heading}</SectionTitle>
      <TaskList
        tasks={items}
        areas={areas}
        showArea={false}
        onOpen={openTask}
        onError={setActionError}
        emptyText="Nothing here."
        trailing={
          start
            ? (t) => (
                <button
                  className="rounded-lg border border-line bg-surface px-2 py-1 text-xs text-ink-muted opacity-0 hover:text-ink focus:opacity-100 group-hover:opacity-100"
                  onClick={() =>
                    run(() => window.cortex.tasks.update({ id: t.id, status: 'doing' }))
                  }
                >
                  Start
                </button>
              )
            : undefined
        }
      />
    </Card>
  );

  const doneColumn = (
    <Card label="Done this week" className="min-w-0">
      <SectionTitle hint={String(done.length)}>Done this week</SectionTitle>
      {done.length === 0 ? (
        <p className="px-2 py-3 text-sm text-ink-muted">Nothing here.</p>
      ) : (
        <ul>
          {done.map((t) => (
            <TaskRow
              key={t.id}
              task={t}
              area={area}
              showArea={false}
              onOpen={(task) => openTask(task.id)}
              onToggle={(task) => run(() => toggleTask(task))}
            />
          ))}
        </ul>
      )}
    </Card>
  );

  return (
    <div>
      <header className="mb-6 flex items-center gap-4">
        <Ring done={done.length} total={total} color={areaColor(area)} />
        <div>
          <h1 className="text-3xl font-semibold tracking-tight">{area.name}</h1>
          <p className="mt-1 text-ink-muted" data-testid="area-progress">
            {done.length} done this week · {todo.length + doing.length} still open
          </p>
        </div>
      </header>
      <ErrorNote message={error ?? actionError} />
      <form
        className="mb-6"
        onSubmit={(e) => {
          e.preventDefault();
          const text = title.trim();
          if (!text) return;
          setTitle('');
          run(() => window.cortex.tasks.create({ title: text, areaId, status: 'todo' }));
        }}
      >
        <input
          className={inputClass}
          aria-label={`Add a task to ${area.name}`}
          placeholder={`Add a task to ${area.name} and press Enter`}
          value={title}
          onChange={(e) => setTitle(e.target.value)}
        />
      </form>
      {upcomingHere.length > 0 && (
        <Card label="Upcoming in this area" className="mb-4">
          <SectionTitle>Upcoming</SectionTitle>
          <ul>
            {upcomingHere.map((t) => (
              <TaskRow
                key={t.id}
                task={t}
                area={area}
                showArea={false}
                onOpen={(task) => openTask(task.id)}
                onToggle={(task) => run(() => toggleTask(task))}
              />
            ))}
          </ul>
        </Card>
      )}
      <div className="grid gap-4 lg:grid-cols-3">
        {column('To do', todo, true)}
        {column('Doing', doing)}
        {doneColumn}
      </div>
    </div>
  );
}
