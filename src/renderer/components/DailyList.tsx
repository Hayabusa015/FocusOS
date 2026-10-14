import { useState } from 'react';
import type { Area, Task, TodayView } from '@shared/core';
import { errorMessage } from '@/hooks/useLive';
import { ErrorNote } from './ui';
import { TaskList } from './TaskList';

/**
 * The daily task list: what is due today, with check marks, drag to reorder, steps indented
 * underneath, and a box to add to today. What was finished today stays below, checked off.
 */
export function DailyList({
  today,
  areas,
  openTask,
  onFocus,
}: {
  today: TodayView;
  areas: Area[];
  openTask(id: string): void;
  onFocus?(task: Task): void;
}) {
  const [error, setError] = useState<string | null>(null);
  return (
    <div data-testid="daily-list">
      <ErrorNote message={error} />
      <TaskList
        tasks={today.dueToday}
        doneTasks={today.doneToday}
        areas={areas}
        onOpen={openTask}
        onFocus={onFocus}
        onError={setError}
        emptyText="Nothing on today's list yet. Add the first thing below."
        addPlaceholder="Add to today and press Enter"
        onAdd={(title) =>
          window.cortex.tasks
            .create({ title, dueDate: today.date })
            .catch((e: unknown) => setError(errorMessage(e)))
        }
      />
    </div>
  );
}
