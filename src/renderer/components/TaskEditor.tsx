import { useCallback, useEffect, useRef, useState } from 'react';
import { WEEKDAY_SHORT } from '@shared/dates';
import type { Area, Recurrence, Task, TaskSize, TaskStatus } from '@shared/core';
import { errorMessage, useLive } from '@/hooks/useLive';
import { buttonPrimary, buttonQuiet, ErrorNote, inputClass } from './ui';

type Kind = Recurrence['freq'] | 'none';

interface Draft {
  title: string;
  notes: string;
  areaId: string;
  status: TaskStatus;
  size: TaskSize;
  dueDate: string;
  dueTime: string;
  kind: Kind;
  days: number[];
  dayOfMonth: number;
  everyN: number;
  blockOn: boolean;
  blockDate: string;
  blockTime: string;
  blockMinutes: number;
}

function toDraft(task: Task | null, areaId: string | null): Draft {
  const rec = task?.recurrence ?? null;
  const start = task?.scheduledStart ? new Date(task.scheduledStart) : null;
  const pad = (n: number) => String(n).padStart(2, '0');
  return {
    title: task?.title ?? '',
    notes: task?.notes ?? '',
    areaId: task?.areaId ?? areaId ?? '',
    status: task?.status ?? 'todo',
    size: task?.size ?? 's',
    dueDate: task?.dueDate ?? '',
    dueTime: task?.dueTime ?? '',
    kind: rec?.freq ?? 'none',
    days: rec?.freq === 'weekly' ? rec.days : [],
    dayOfMonth: rec?.freq === 'monthly' ? rec.day : 1,
    everyN: rec?.freq === 'every_n_days' ? rec.n : 2,
    blockOn: start !== null,
    blockDate: start
      ? `${start.getFullYear()}-${pad(start.getMonth() + 1)}-${pad(start.getDate())}`
      : '',
    blockTime: start ? `${pad(start.getHours())}:${pad(start.getMinutes())}` : '',
    blockMinutes: task?.scheduledMinutes ?? 30,
  };
}

function recurrenceOf(d: Draft): Recurrence | null {
  switch (d.kind) {
    case 'none':
      return null;
    case 'daily':
      return { freq: 'daily' };
    case 'weekdays':
      return { freq: 'weekdays' };
    case 'weekly':
      return { freq: 'weekly', days: d.days.length ? d.days : [0] };
    case 'monthly':
      return { freq: 'monthly', day: d.dayOfMonth };
    case 'every_n_days':
      return { freq: 'every_n_days', n: d.everyN };
  }
}

interface Props {
  /** The task to edit, or null to create one. */
  taskId: string | null;
  areas: Area[];
  defaultAreaId?: string | null;
  onClose(): void;
}

export function TaskEditor({ taskId, areas, defaultAreaId = null, onClose }: Props) {
  const load = useCallback(
    () => (taskId ? window.cortex.tasks.get(taskId) : Promise.resolve(null)),
    [taskId],
  );
  const { data: loaded, error: loadError } = useLive(load);
  // The form mounts once the task has arrived, so it starts filled in. Later reloads (a step
  // ticked) only change the steps; they never overwrite what is being typed.
  const ready = taskId === null || loaded !== null;
  return (
    <EditorShell onClose={onClose} title={taskId ? 'Edit task' : 'New task'}>
      {loadError && <ErrorNote message={loadError} />}
      {ready ? (
        <EditorForm
          task={loaded?.task ?? null}
          subtasks={loaded?.subtasks ?? []}
          areas={areas}
          defaultAreaId={defaultAreaId}
          onClose={onClose}
        />
      ) : (
        <p className="text-sm text-ink-muted">Loading…</p>
      )}
    </EditorShell>
  );
}

function EditorShell({
  title,
  onClose,
  children,
}: {
  title: string;
  onClose(): void;
  children: React.ReactNode;
}) {
  return (
    <div
      className="fixed inset-0 z-40 flex justify-end bg-ground/70"
      onMouseDown={(e) => e.target === e.currentTarget && onClose()}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-label={title}
        className="h-full w-full max-w-md overflow-y-auto border-l border-line bg-surface p-6"
        onKeyDown={(e) => {
          if (e.key === 'Escape') onClose();
        }}
      >
        <h2 className="mb-4 text-lg font-semibold">{title}</h2>
        {children}
      </div>
    </div>
  );
}

function EditorForm({
  task,
  subtasks,
  areas,
  defaultAreaId,
  onClose,
}: {
  task: Task | null;
  subtasks: Task[];
  areas: Area[];
  defaultAreaId: string | null;
  onClose(): void;
}) {
  const [draft, setDraft] = useState<Draft>(() => toDraft(task, defaultAreaId));
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [newStep, setNewStep] = useState('');
  const titleRef = useRef<HTMLInputElement>(null);
  useEffect(() => titleRef.current?.focus(), []);

  const set = <K extends keyof Draft>(key: K, value: Draft[K]) =>
    setDraft((d) => ({ ...d, [key]: value }));

  async function save() {
    setSaving(true);
    setError(null);
    try {
      const common = {
        title: draft.title,
        notes: draft.notes,
        areaId: draft.areaId || null,
        size: draft.size,
        dueDate: draft.dueDate || null,
        dueTime: draft.dueTime || null,
        recurrence: recurrenceOf(draft),
        block:
          draft.blockOn && draft.blockDate && draft.blockTime
            ? { date: draft.blockDate, time: draft.blockTime, minutes: draft.blockMinutes }
            : null,
      };
      if (task) {
        await window.cortex.tasks.update({
          id: task.id,
          ...common,
          ...(task.status === 'done' ? {} : { status: draft.status }),
        });
      } else {
        await window.cortex.tasks.create({ ...common, status: common.areaId ? 'todo' : 'inbox' });
      }
      onClose();
    } catch (e) {
      setError(errorMessage(e));
    } finally {
      setSaving(false);
    }
  }

  async function run(action: () => Promise<unknown>) {
    setError(null);
    try {
      await action();
    } catch (e) {
      setError(errorMessage(e));
    }
  }

  async function addStep() {
    const title = newStep.trim();
    if (!title || !task) return;
    setNewStep('');
    await run(() => window.cortex.tasks.create({ title, parentId: task.id }));
  }

  return (
    <div onKeyDown={(e) => e.key === 'Enter' && e.ctrlKey && void save()}>
      <ErrorNote message={error} />
      <div className="space-y-4">
        <label className="block text-sm">
          <span className="mb-1 block text-ink-muted">Title</span>
          <input
            ref={titleRef}
            className={inputClass}
            value={draft.title}
            maxLength={300}
            onChange={(e) => set('title', e.target.value)}
          />
        </label>

        <div className="grid grid-cols-2 gap-3">
          <label className="block text-sm">
            <span className="mb-1 block text-ink-muted">Area</span>
            <select
              className={inputClass}
              value={draft.areaId}
              onChange={(e) => set('areaId', e.target.value)}
            >
              <option value="">Inbox (no area)</option>
              {areas.map((a) => (
                <option key={a.id} value={a.id}>
                  {a.name}
                </option>
              ))}
            </select>
          </label>
          <label className="block text-sm">
            <span className="mb-1 block text-ink-muted">Size</span>
            <select
              className={inputClass}
              value={draft.size}
              onChange={(e) => set('size', e.target.value as TaskSize)}
            >
              <option value="s">Small (a few minutes)</option>
              <option value="m">Medium</option>
              <option value="l">Large</option>
            </select>
          </label>
        </div>

        {task && task.status !== 'done' && (
          <label className="block text-sm">
            <span className="mb-1 block text-ink-muted">Status</span>
            <select
              className={inputClass}
              value={draft.status}
              onChange={(e) => set('status', e.target.value as TaskStatus)}
            >
              <option value="inbox">Inbox</option>
              <option value="todo">To do</option>
              <option value="doing">Doing</option>
              <option value="someday">Someday</option>
            </select>
          </label>
        )}

        <div className="grid grid-cols-2 gap-3">
          <label className="block text-sm">
            <span className="mb-1 block text-ink-muted">Due date</span>
            <input
              type="date"
              className={inputClass}
              value={draft.dueDate}
              onChange={(e) => set('dueDate', e.target.value)}
            />
          </label>
          <label className="block text-sm">
            <span className="mb-1 block text-ink-muted">Due time</span>
            <input
              type="time"
              className={inputClass}
              value={draft.dueTime}
              onChange={(e) => set('dueTime', e.target.value)}
            />
          </label>
        </div>

        <fieldset className="space-y-2 text-sm">
          <legend className="mb-1 text-ink-muted">Repeats</legend>
          <select
            aria-label="Repeats"
            className={inputClass}
            value={draft.kind}
            onChange={(e) => set('kind', e.target.value as Kind)}
          >
            <option value="none">Never</option>
            <option value="daily">Every day</option>
            <option value="weekdays">Every weekday</option>
            <option value="weekly">Weekly, on chosen days</option>
            <option value="monthly">Monthly, on a day of the month</option>
            <option value="every_n_days">Every few days</option>
          </select>
          {draft.kind === 'weekly' && (
            <div className="flex flex-wrap gap-1.5">
              {WEEKDAY_SHORT.map((name, day) => {
                const on = draft.days.includes(day);
                return (
                  <button
                    key={name}
                    type="button"
                    aria-pressed={on}
                    className={`rounded-lg border px-2.5 py-1 text-xs ${on ? 'border-accent bg-accent text-accent-ink' : 'border-line text-ink-muted'}`}
                    onClick={() =>
                      set('days', on ? draft.days.filter((d) => d !== day) : [...draft.days, day])
                    }
                  >
                    {name}
                  </button>
                );
              })}
            </div>
          )}
          {draft.kind === 'monthly' && (
            <label className="flex items-center gap-2">
              On day
              <input
                type="number"
                min={1}
                max={31}
                className={`${inputClass} w-20`}
                value={draft.dayOfMonth}
                onChange={(e) => set('dayOfMonth', Number(e.target.value) || 1)}
              />
            </label>
          )}
          {draft.kind === 'every_n_days' && (
            <label className="flex items-center gap-2">
              Every
              <input
                type="number"
                min={1}
                max={365}
                className={`${inputClass} w-20`}
                value={draft.everyN}
                onChange={(e) => set('everyN', Number(e.target.value) || 1)}
              />
              days
            </label>
          )}
          {draft.kind !== 'none' && !draft.dueDate && (
            <p className="text-xs text-caution">A repeating task needs a due date.</p>
          )}
        </fieldset>

        <fieldset className="space-y-2 text-sm">
          <legend className="mb-1 text-ink-muted">Time block on Today</legend>
          <label className="flex items-center gap-2">
            <input
              type="checkbox"
              className="accent-accent"
              checked={draft.blockOn}
              onChange={(e) => set('blockOn', e.target.checked)}
            />
            Put it on my timeline
          </label>
          {draft.blockOn && (
            <div className="grid grid-cols-3 gap-2">
              <input
                type="date"
                aria-label="Block date"
                className={inputClass}
                value={draft.blockDate}
                onChange={(e) => set('blockDate', e.target.value)}
              />
              <input
                type="time"
                aria-label="Block start"
                className={inputClass}
                value={draft.blockTime}
                onChange={(e) => set('blockTime', e.target.value)}
              />
              <input
                type="number"
                aria-label="Block minutes"
                min={5}
                max={720}
                step={5}
                className={inputClass}
                value={draft.blockMinutes}
                onChange={(e) => set('blockMinutes', Number(e.target.value) || 30)}
              />
            </div>
          )}
        </fieldset>

        <label className="block text-sm">
          <span className="mb-1 block text-ink-muted">Notes</span>
          <textarea
            className={`${inputClass} min-h-24`}
            value={draft.notes}
            onChange={(e) => set('notes', e.target.value)}
          />
        </label>

        {task && !task.parentId && (
          <section aria-label="Steps" className="space-y-1 text-sm">
            <h3 className="text-ink-muted">Steps</h3>
            {subtasks.map((s) => (
              <label key={s.id} className="flex items-center gap-2 py-0.5">
                <input
                  type="checkbox"
                  className="accent-accent"
                  checked={s.status === 'done'}
                  onChange={() =>
                    void run(() =>
                      s.status === 'done'
                        ? window.cortex.tasks.reopen(s.id)
                        : window.cortex.tasks.complete(s.id),
                    )
                  }
                />
                <span className={s.status === 'done' ? 'text-ink-muted line-through' : ''}>
                  {s.title}
                </span>
              </label>
            ))}
            <input
              className={inputClass}
              placeholder="Add a step and press Enter"
              value={newStep}
              onChange={(e) => setNewStep(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter') {
                  e.preventDefault();
                  e.stopPropagation();
                  void addStep();
                }
              }}
            />
          </section>
        )}

        <div className="flex flex-wrap items-center gap-2 pt-2">
          <button
            className={buttonPrimary}
            disabled={saving || !draft.title.trim()}
            onClick={() => void save()}
          >
            {task ? 'Save' : 'Add task'}
          </button>
          <button className={buttonQuiet} onClick={onClose}>
            Cancel
          </button>
          {task && (
            <>
              <span className="flex-1" />
              <button
                className={buttonQuiet}
                onClick={() =>
                  void run(async () => {
                    if (task.status === 'done') await window.cortex.tasks.reopen(task.id);
                    else await window.cortex.tasks.complete(task.id);
                    onClose();
                  })
                }
              >
                {task.status === 'done' ? 'Reopen' : 'Mark done'}
              </button>
              <button
                className={buttonQuiet}
                onClick={() =>
                  void run(async () => {
                    await window.cortex.tasks.delete(task.id);
                    onClose();
                  })
                }
              >
                Delete
              </button>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
