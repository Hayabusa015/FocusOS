import { useCallback, useMemo, useState } from 'react';
import type { Area, Task } from '@shared/core';
import { errorMessage, useLive } from '@/hooks/useLive';
import { toggleTask } from '@/lib/actions';
import { indexAreas } from '@/lib/areas';
import { friendlyDate, friendlyTime } from '@/lib/dates';
import { AreaTag, Check, inputClass } from './ui';

interface Props {
  /** The main tasks, in the order to show them. */
  tasks: Task[];
  areas: Area[];
  onOpen(id: string): void;
  onError(message: string): void;
  /** Hide the area tag on pages that are already inside one area. */
  showArea?: boolean;
  /** Tasks finished already, shown checked off underneath. */
  doneTasks?: Task[];
  /** Adds a task from the box at the bottom. Leave out for no box. */
  onAdd?(title: string): Promise<unknown>;
  addPlaceholder?: string;
  /** Extra controls on the right of a main task. */
  trailing?(task: Task): React.ReactNode;
  /** Shows a Focus button on open tasks. */
  onFocus?(task: Task): void;
  /** Put the extra controls under the title instead of beside it (long controls, narrow lists). */
  trailingBelow?: boolean;
  /** Lets a page add its own keys on a focused task (the Inbox files by number). */
  onTaskKey?(task: Task, event: React.KeyboardEvent): void;
  emptyText?: string;
}

type Drop = { id: string; before: boolean } | null;

/**
 * A checklist like Notion's: tick a task, drag the handle to reorder, indent a task to make it a
 * step of the one above (one level), and open or close a task's steps. Everything also works from
 * the keyboard: Alt+Up and Alt+Down move a task, Alt+Right indents it, Alt+Left brings it back.
 */
export function TaskList({
  tasks,
  areas,
  onOpen,
  onError,
  showArea = true,
  doneTasks = [],
  onAdd,
  addPlaceholder = 'Add a task and press Enter',
  trailing,
  onFocus,
  trailingBelow = false,
  onTaskKey,
  emptyText,
}: Props) {
  const byArea = indexAreas(areas);
  const ids = useMemo(() => tasks.map((t) => t.id).join(','), [tasks]);
  const loadChildren = useCallback(
    () => (ids ? window.cortex.tasks.children(ids.split(',')) : Promise.resolve({})),
    [ids],
  );
  const children: Record<string, Task[]> = useLive(loadChildren).data ?? {};

  const [closed, setClosed] = useState<ReadonlySet<string>>(new Set());
  const [dragging, setDragging] = useState<{ id: string; parentId: string | null } | null>(null);
  const [drop, setDrop] = useState<Drop>(null);
  const [title, setTitle] = useState('');

  const fail = (e: unknown) => onError(errorMessage(e));
  const run = (action: () => Promise<unknown>) => action().catch(fail);

  const siblingsOf = (parentId: string | null): Task[] =>
    parentId ? (children[parentId] ?? []) : tasks;

  function moveTo(id: string, parentId: string | null, targetId: string, before: boolean) {
    const list = siblingsOf(parentId).map((t) => t.id);
    const without = list.filter((x) => x !== id);
    const at = without.indexOf(targetId) + (before ? 0 : 1);
    without.splice(at, 0, id);
    if (without.join() !== list.join()) void run(() => window.cortex.tasks.reorder(without));
  }

  function nudge(task: Task, by: -1 | 1) {
    const list = siblingsOf(task.parentId);
    const at = list.findIndex((t) => t.id === task.id);
    const target = list[at + by];
    if (target) moveTo(task.id, task.parentId, target.id, by === -1);
  }

  const indent = (task: Task, index: number) => {
    const above = tasks[index - 1];
    if (above && task.subtaskCount === 0) {
      void run(() => window.cortex.tasks.update({ id: task.id, parentId: above.id }));
    }
  };
  const outdent = (task: Task) =>
    void run(() => window.cortex.tasks.update({ id: task.id, parentId: null }));

  function row(task: Task, index: number, depth: 0 | 1) {
    const kids = depth === 0 ? (children[task.id] ?? []) : [];
    const isClosed = closed.has(task.id);
    const done = task.status === 'done';
    const due = task.dueDate
      ? `${friendlyDate(task.dueDate)}${task.dueTime ? ` · ${friendlyTime(task.dueTime)}` : ''}`
      : null;
    const marker =
      drop?.id === task.id && dragging && dragging.parentId === task.parentId
        ? drop.before
          ? 'shadow-[inset_0_2px_0_var(--color-accent-soft)]'
          : 'shadow-[inset_0_-2px_0_var(--color-accent-soft)]'
        : '';

    return (
      <li key={task.id} data-testid="task-row">
        <div
          className={`group relative flex items-center gap-2 rounded-lg py-1.5 pl-5 pr-2 hover:bg-raised focus-within:bg-raised ${marker} ${dragging?.id === task.id ? 'opacity-40' : ''}`}
          onDragOver={(e) => {
            if (!dragging || dragging.parentId !== task.parentId || dragging.id === task.id) return;
            e.preventDefault();
            const box = e.currentTarget.getBoundingClientRect();
            setDrop({ id: task.id, before: e.clientY < box.top + box.height / 2 });
          }}
          onDrop={(e) => {
            if (!dragging || !drop || drop.id !== task.id) return;
            e.preventDefault();
            moveTo(dragging.id, dragging.parentId, task.id, drop.before);
            setDragging(null);
            setDrop(null);
          }}
        >
          <span
            aria-hidden
            data-testid="drag-handle"
            title="Drag to reorder (or Alt+Up and Alt+Down)"
            draggable
            className="absolute -left-3 top-1/2 -translate-y-1/2 cursor-grab select-none px-0.5 text-ink-muted opacity-0 group-hover:opacity-100 group-focus-within:opacity-100 active:cursor-grabbing"
            onDragStart={(e) => {
              e.dataTransfer.effectAllowed = 'move';
              e.dataTransfer.setData('text/plain', task.id);
              const li = e.currentTarget.closest('li');
              if (li) e.dataTransfer.setDragImage(li, 12, 12);
              setDragging({ id: task.id, parentId: task.parentId });
            }}
            onDragEnd={() => {
              setDragging(null);
              setDrop(null);
            }}
          >
            ⋮⋮
          </span>
          {depth === 0 && kids.length > 0 ? (
            <button
              aria-label={isClosed ? `Show steps of ${task.title}` : `Hide steps of ${task.title}`}
              aria-expanded={!isClosed}
              className="absolute left-0.5 top-1/2 w-4 -translate-y-1/2 text-xs text-ink-muted hover:text-ink"
              onClick={() =>
                setClosed((prev) => {
                  const next = new Set(prev);
                  if (next.has(task.id)) next.delete(task.id);
                  else next.add(task.id);
                  return next;
                })
              }
            >
              {isClosed ? '▸' : '▾'}
            </button>
          ) : null}
          <Check
            checked={done}
            label={done ? `Reopen ${task.title}` : `Complete ${task.title}`}
            onChange={() => void run(() => toggleTask(task))}
          />
          <button
            className="min-w-0 flex-1 text-left"
            onClick={() => onOpen(task.id)}
            onKeyDown={(e) => {
              onTaskKey?.(task, e);
              if (!e.altKey) return;
              if (e.key === 'ArrowUp') nudge(task, -1);
              else if (e.key === 'ArrowDown') nudge(task, 1);
              else if (e.key === 'ArrowRight' && depth === 0) indent(task, index);
              else if (e.key === 'ArrowLeft' && depth === 1) outdent(task);
              else return;
              e.preventDefault();
            }}
          >
            <span className={`block truncate text-sm ${done ? 'text-ink-muted line-through' : ''}`}>
              {task.title}
            </span>
            <span className="mt-0.5 flex flex-wrap items-center gap-x-3 text-xs text-ink-muted">
              {showArea && depth === 0 && (
                <AreaTag area={task.areaId ? byArea.get(task.areaId) : null} />
              )}
              {due && <span>{due}</span>}
              {task.recurrenceText && <span>↻ {task.recurrenceText}</span>}
              {depth === 0 && task.subtaskCount > 0 && (
                <span>
                  {task.subtasksDone}/{task.subtaskCount} steps
                </span>
              )}
            </span>
          </button>
          {!done && onFocus && (
            <button
              className="rounded px-1.5 text-xs text-ink-muted opacity-0 hover:bg-line hover:text-ink focus:opacity-100 group-hover:opacity-100"
              title="Focus on this"
              aria-label={`Focus on ${task.title}`}
              onClick={() => onFocus(task)}
            >
              ◎
            </button>
          )}
          {!done && depth === 0 && index > 0 && task.subtaskCount === 0 && (
            <button
              className="rounded px-1.5 text-xs text-ink-muted opacity-0 hover:bg-line hover:text-ink focus:opacity-100 group-hover:opacity-100"
              title="Make it a step of the task above (Alt+Right)"
              aria-label={`Indent ${task.title}`}
              onClick={() => indent(task, index)}
            >
              ⇥
            </button>
          )}
          {depth === 1 && (
            <button
              className="rounded px-1.5 text-xs text-ink-muted opacity-0 hover:bg-line hover:text-ink focus:opacity-100 group-hover:opacity-100"
              title="Bring it back to the main list (Alt+Left)"
              aria-label={`Outdent ${task.title}`}
              onClick={() => outdent(task)}
            >
              ⇤
            </button>
          )}
          {depth === 0 && !trailingBelow && trailing?.(task)}
        </div>
        {depth === 0 && trailingBelow && (
          <div className="pb-1.5 pl-[3.25rem]">{trailing?.(task)}</div>
        )}
        {kids.length > 0 && !isClosed && (
          <ul className="ml-5 border-l border-line">{kids.map((k, i) => row(k, i, 1))}</ul>
        )}
      </li>
    );
  }

  return (
    <div>
      {tasks.length === 0 && doneTasks.length === 0 && emptyText && (
        <p className="px-2 py-3 text-sm text-ink-muted">{emptyText}</p>
      )}
      <ul>{tasks.map((t, i) => row(t, i, 0))}</ul>
      {onAdd && (
        <form
          className="mt-2"
          onSubmit={(e) => {
            e.preventDefault();
            const text = title.trim();
            if (!text) return;
            setTitle('');
            void run(() => onAdd(text));
          }}
        >
          <input
            className={inputClass}
            aria-label={addPlaceholder}
            placeholder={addPlaceholder}
            value={title}
            maxLength={300}
            onChange={(e) => setTitle(e.target.value)}
          />
        </form>
      )}
      {doneTasks.length > 0 && (
        <section aria-label="Done" className="mt-4">
          <h3 className="mb-1 px-2 text-xs font-semibold uppercase tracking-wide text-ink-muted">
            Done · {doneTasks.length}
          </h3>
          <ul>
            {doneTasks.map((t) => (
              <li
                key={t.id}
                data-testid="task-row-done"
                className="group flex items-center gap-2 rounded-lg py-1.5 pl-5 pr-2 hover:bg-raised"
              >
                <Check
                  checked
                  label={`Reopen ${t.title}`}
                  onChange={() => void run(() => toggleTask(t))}
                />
                <button
                  className="min-w-0 flex-1 truncate text-left text-sm text-ink-muted line-through"
                  onClick={() => onOpen(t.id)}
                >
                  {t.title}
                </button>
              </li>
            ))}
          </ul>
        </section>
      )}
    </div>
  );
}
