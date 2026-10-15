import { useCallback, useMemo, useRef, useState } from 'react';
import type { Area, Task } from '@shared/core';
import { errorMessage, useLive } from '@/hooks/useLive';
import { toggleTask } from '@/lib/actions';
import { areaColor } from '@/lib/areas';
import { progressFor } from '@/lib/list-progress';
import { Check, ErrorNote, inputClass } from './ui';
import { PulseIcon } from './PulseIcon';
import { PulseMeter } from './PulseProgress';
interface Props {
  tasks: Task[];
  areas: Area[];
  onOpen(id: string): void;
  onFocus?(id: string): void;
  onAdd?(title: string): Promise<unknown>;
  addLabel?: string;
}
type Drag = { id: string; parentId: string | null };
type Drop = { id: string; before: boolean } | null;
const collapseKey = 'cortex.pulse.closed-lists';
function readClosed(): Set<string> {
  try {
    const value: unknown = JSON.parse(localStorage.getItem(collapseKey) ?? '[]');
    return new Set(
      Array.isArray(value) ? value.filter((s): s is string => typeof s === 'string') : [],
    );
  } catch {
    return new Set();
  }
}
/** SQLite remains the single source of task data; mutations keep the existing undo behavior. */
export function PulseLists({
  tasks,
  areas,
  onOpen,
  onFocus,
  onAdd,
  addLabel = 'Add a list and press Enter',
}: Props) {
  const ids = useMemo(() => tasks.map((t) => t.id).join(','), [tasks]);
  const loadChildren = useCallback(
    () => (ids ? window.cortex.tasks.children(ids.split(',')) : Promise.resolve({})),
    [ids],
  );
  const { data, error: loadError } = useLive<Record<string, Task[]>>(loadChildren);
  const children = data ?? {};
  const [closed, setClosed] = useState(readClosed),
    [dragging, setDragging] = useState<Drag | null>(null),
    [drop, setDrop] = useState<Drop>(null);
  const [error, setError] = useState<string | null>(null),
    [busy, setBusy] = useState(false);
  const lock = useRef(false),
    addInput = useRef<HTMLInputElement>(null);
  const [title, setTitle] = useState(''),
    [drafts, setDrafts] = useState<Record<string, string>>({});
  async function run(action: () => Promise<unknown>, success?: () => void) {
    if (lock.current) return;
    lock.current = true;
    setBusy(true);
    setError(null);
    try {
      await action();
      success?.();
    } catch (e) {
      setError(errorMessage(e));
    } finally {
      lock.current = false;
      setBusy(false);
    }
  }
  function toggleClosed(id: string) {
    const next = new Set(closed);
    if (next.has(id)) next.delete(id);
    else next.add(id);
    setClosed(next);
    try {
      localStorage.setItem(collapseKey, JSON.stringify([...next]));
    } catch {
      /* View preferences are optional. */
    }
  }
  const siblings = (parentId: string | null) => (parentId ? (children[parentId] ?? []) : tasks);
  function moveTo(item: Drag, targetId: string, before: boolean) {
    const original = siblings(item.parentId).map((t) => t.id);
    if (!original.includes(item.id) || !original.includes(targetId) || item.id === targetId) return;
    const order = original.filter((id) => id !== item.id);
    order.splice(order.indexOf(targetId) + (before ? 0 : 1), 0, item.id);
    if (original.join() !== order.join()) void run(() => window.cortex.tasks.reorder(order));
  }
  function nudge(task: Task, by: -1 | 1) {
    const list = siblings(task.parentId),
      target = list[list.findIndex((t) => t.id === task.id) + by];
    if (target) moveTo(task, target.id, by < 0);
  }
  function keyboard(event: React.KeyboardEvent, task: Task) {
    if (!event.altKey) return;
    if (event.key === 'ArrowUp' || event.key === 'ArrowDown') {
      event.preventDefault();
      nudge(task, event.key === 'ArrowUp' ? -1 : 1);
    } else if (event.key === 'ArrowRight' && !task.parentId && !task.subtaskCount) {
      const previous = tasks[tasks.findIndex((t) => t.id === task.id) - 1];
      if (previous) {
        event.preventDefault();
        void run(() => window.cortex.tasks.update({ id: task.id, parentId: previous.id }));
      }
    } else if (event.key === 'ArrowLeft' && task.parentId) {
      event.preventDefault();
      void run(() => window.cortex.tasks.update({ id: task.id, parentId: null }));
    }
  }
  function dragHandle(task: Task) {
    return (
      <button
        className="pulse-grip"
        data-testid="drag-handle"
        aria-label={`Reorder ${task.title}`}
        title="Drag to reorder, or Alt + Up / Down"
        aria-keyshortcuts="Alt+ArrowUp Alt+ArrowDown"
        draggable={!busy}
        disabled={busy}
        onKeyDown={(e) => keyboard(e, task)}
        onDragStart={(e) => {
          e.dataTransfer.effectAllowed = 'move';
          e.dataTransfer.setData('text/plain', task.id);
          setDragging({ id: task.id, parentId: task.parentId });
        }}
        onDragEnd={() => {
          setDragging(null);
          setDrop(null);
        }}
      >
        ⠿
      </button>
    );
  }
  function dropHandlers(task: Task) {
    return {
      onDragOver: (e: React.DragEvent) => {
        if (!dragging || dragging.id === task.id || busy) return;
        if (dragging.parentId !== task.parentId) {
          if (
            dragging.parentId &&
            !task.parentId &&
            dragging.parentId !== task.id &&
            task.status !== 'done'
          ) {
            e.preventDefault();
            setDrop({ id: task.id, before: false });
          }
          return;
        }
        e.preventDefault();
        const rect = e.currentTarget.getBoundingClientRect();
        setDrop({ id: task.id, before: e.clientY < rect.top + rect.height / 2 });
      },
      onDrop: (e: React.DragEvent) => {
        e.preventDefault();
        e.stopPropagation();
        if (!dragging || !drop || drop.id !== task.id) return;
        if (dragging.parentId === task.parentId) moveTo(dragging, task.id, drop.before);
        else if (
          dragging.parentId &&
          !task.parentId &&
          dragging.parentId !== task.id &&
          task.status !== 'done'
        ) {
          void run(
            () => window.cortex.tasks.update({ id: dragging.id, parentId: task.id }),
            () =>
              setClosed((prev) => {
                const next = new Set(prev);
                next.delete(task.id);
                return next;
              }),
          );
        }
        setDragging(null);
        setDrop(null);
      },
    };
  }
  function moveButtons(task: Task) {
    const list = siblings(task.parentId),
      index = list.findIndex((t) => t.id === task.id);
    return (
      <span className="pulse-move">
        <button
          disabled={busy || index === 0}
          aria-label={`Move ${task.title} up`}
          onClick={() => nudge(task, -1)}
        >
          ↑
        </button>
        <button
          disabled={busy || index === list.length - 1}
          aria-label={`Move ${task.title} down`}
          onClick={() => nudge(task, 1)}
        >
          ↓
        </button>
      </span>
    );
  }
  const marker = (id: string) =>
    drop?.id === id ? (drop.before ? 'pulse-drop-before' : 'pulse-drop-after') : '';
  return (
    <section className="pulse-lists" aria-label="Task lists" aria-busy={busy}>
      <div className="pulse-section-heading">
        <h2>
          Your lists <small>{tasks.length}</small>
        </h2>
        {onAdd && (
          <button className="pulse-small-button" onClick={() => addInput.current?.focus()}>
            <PulseIcon name="plus" />
            New list
          </button>
        )}
      </div>
      <p className="pulse-drag-hint">Drag the handles to reorder lists and subtasks.</p>
      <ErrorNote message={error ?? loadError} />
      {onAdd && (
        <form
          className="pulse-add-list"
          onSubmit={(e) => {
            e.preventDefault();
            const text = title.trim();
            if (text)
              void run(
                () => onAdd(text),
                () => setTitle(''),
              );
          }}
        >
          <input
            ref={addInput}
            className={inputClass}
            aria-label={addLabel}
            placeholder={addLabel}
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            maxLength={300}
            disabled={busy}
          />
        </form>
      )}
      {tasks.length === 0 && (
        <p className="pulse-empty">Nothing on today&apos;s list yet. Add the first thing above.</p>
      )}
      <div className="pulse-list-stack">
        {tasks.map((task) => {
          const kids = children[task.id] ?? [],
            isClosed = closed.has(task.id),
            progress = progressFor(task),
            done = task.status === 'done',
            area = areas.find((a) => a.id === task.areaId);
          return (
            <article
              key={task.id}
              data-list-id={task.id}
              data-testid="task-row"
              className={`pulse-list-card ${marker(task.id)} ${dragging?.id === task.id ? 'pulse-dragging' : ''}`}
              style={{ '--list-color': areaColor(area) } as React.CSSProperties}
            >
              <header className="pulse-list-heading" {...dropHandlers(task)}>
                {dragHandle(task)}
                <Check
                  checked={done}
                  label={done ? `Reopen ${task.title}` : `Complete ${task.title}`}
                  onChange={() => void run(() => toggleTask(task))}
                />
                <button
                  className="pulse-list-title"
                  onClick={() => onOpen(task.id)}
                  onKeyDown={(e) => keyboard(e, task)}
                >
                  <strong className={done ? 'line-through text-ink-muted' : ''}>
                    {task.title}
                  </strong>
                  <small>
                    {area?.name ?? 'Personal inbox'}
                    {task.subtaskCount > 0
                      ? ` · ${task.subtasksDone}/${task.subtaskCount} steps`
                      : ' · Add steps below'}
                  </small>
                </button>
                <span className="pulse-list-ratio">
                  {progress.done} / {progress.total}
                </span>
                {moveButtons(task)}
                <button
                  className={`pulse-collapse ${isClosed ? '' : 'pulse-expanded'}`}
                  aria-label={`${isClosed ? 'Show' : 'Hide'} steps of ${task.title}`}
                  aria-expanded={!isClosed}
                  onClick={() => toggleClosed(task.id)}
                >
                  <PulseIcon name="chevron" />
                </button>
              </header>
              <div className="pulse-list-progress">
                <PulseMeter value={progress.percent} label={`${task.title} completion`} />
                <span>{progress.percent}%</span>
              </div>
              {!isClosed && (
                <div className="pulse-children">
                  {kids.map((child) => (
                    <div
                      key={child.id}
                      data-step-id={child.id}
                      data-testid="task-row"
                      className={`pulse-subtask ${marker(child.id)} ${child.status === 'done' ? 'pulse-done' : ''}`}
                      {...dropHandlers(child)}
                    >
                      {dragHandle(child)}
                      <Check
                        checked={child.status === 'done'}
                        label={`${child.status === 'done' ? 'Reopen' : 'Complete'} ${child.title}`}
                        onChange={() => void run(() => toggleTask(child))}
                      />
                      <button
                        className="pulse-child-title"
                        onClick={() => onOpen(child.id)}
                        onKeyDown={(e) => keyboard(e, child)}
                      >
                        {child.title}
                      </button>
                      {onFocus && child.status !== 'done' && (
                        <button
                          className="pulse-child-focus"
                          aria-label={`Focus on ${child.title}`}
                          onClick={() => onFocus(child.id)}
                        >
                          <PulseIcon name="play" />
                        </button>
                      )}
                      {moveButtons(child)}
                    </div>
                  ))}
                  {!done && (
                    <form
                      className="pulse-add-child"
                      onSubmit={(e) => {
                        e.preventDefault();
                        const text = (drafts[task.id] ?? '').trim();
                        if (text)
                          void run(
                            () => window.cortex.tasks.create({ title: text, parentId: task.id }),
                            () => setDrafts((prev) => ({ ...prev, [task.id]: '' })),
                          );
                      }}
                    >
                      <PulseIcon name="plus" />
                      <input
                        aria-label={`Add a subtask to ${task.title}`}
                        placeholder="Add subtask and press Enter"
                        value={drafts[task.id] ?? ''}
                        onChange={(e) =>
                          setDrafts((prev) => ({ ...prev, [task.id]: e.target.value }))
                        }
                        maxLength={300}
                        disabled={busy}
                      />
                    </form>
                  )}
                </div>
              )}
            </article>
          );
        })}
      </div>
    </section>
  );
}
