import type { Area, Task } from '@shared/core';
import { friendlyDate, friendlyTime } from '@/lib/dates';
import { AreaTag, Check } from './ui';

interface Props {
  task: Task;
  area: Area | null | undefined;
  /** Hides the area tag on pages that are already inside one area. */
  showArea?: boolean;
  onOpen(task: Task): void;
  onToggle(task: Task): void;
  /** Extra controls on the right (area chips on the Inbox). */
  trailing?: React.ReactNode;
  onKeyDown?(event: React.KeyboardEvent<HTMLLIElement>): void;
}

export function TaskRow({
  task,
  area,
  showArea = true,
  onOpen,
  onToggle,
  trailing,
  onKeyDown,
}: Props) {
  const done = task.status === 'done';
  const due = task.dueDate
    ? `${friendlyDate(task.dueDate)}${task.dueTime ? ` · ${friendlyTime(task.dueTime)}` : ''}`
    : null;
  return (
    <li
      className="group flex items-center gap-3 rounded-lg px-2 py-2 hover:bg-raised focus-within:bg-raised"
      data-testid="task-row"
      onKeyDown={onKeyDown}
    >
      <Check
        checked={done}
        label={done ? `Reopen ${task.title}` : `Complete ${task.title}`}
        onChange={() => onToggle(task)}
      />
      <button className="min-w-0 flex-1 text-left" onClick={() => onOpen(task)}>
        <span className={`block truncate text-sm ${done ? 'text-ink-muted line-through' : ''}`}>
          {task.title}
        </span>
        <span className="mt-0.5 flex flex-wrap items-center gap-x-3 text-xs text-ink-muted">
          {showArea && <AreaTag area={area} />}
          {due && <span>{due}</span>}
          {task.recurrenceText && <span>↻ {task.recurrenceText}</span>}
          {task.subtaskCount > 0 && (
            <span>
              {task.subtasksDone}/{task.subtaskCount} steps
            </span>
          )}
        </span>
      </button>
      {trailing}
    </li>
  );
}
