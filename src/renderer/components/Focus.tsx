import { useEffect, useState } from 'react';
import type { FocusSession } from '@shared/core';
import { errorMessage } from '@/hooks/useLive';
import { playChime } from '@/lib/sound';
import { buttonPrimary, buttonQuiet, ErrorNote } from './ui';

const CHOICES = [15, 25, 45] as const;

/** Asks how long, then starts a focus session (optionally on one task). */
export function FocusStart({
  taskId,
  taskTitle,
  onStarted,
  onCancel,
}: {
  taskId: string | null;
  taskTitle: string | null;
  onStarted(session: FocusSession): void;
  onCancel(): void;
}) {
  const [minutes, setMinutes] = useState<number>(25);
  const [error, setError] = useState<string | null>(null);

  async function start() {
    try {
      onStarted(await window.cortex.focus.start(taskId, minutes));
    } catch (e) {
      setError(errorMessage(e));
    }
  }

  return (
    <div
      className="fixed inset-0 z-50 grid place-items-center bg-brand-black/40"
      onMouseDown={(e) => e.target === e.currentTarget && onCancel()}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-label="Start a focus session"
        className="w-full max-w-sm rounded-card border border-line bg-surface p-6"
        onKeyDown={(e) => e.key === 'Escape' && onCancel()}
      >
        <h2 className="text-lg font-semibold">Start a focus session</h2>
        <p className="mt-1 text-sm text-ink-muted">
          {taskTitle ? `Just “${taskTitle}”.` : 'One thing, nothing else on screen.'}
        </p>
        <ErrorNote message={error} />
        <div className="my-5 flex gap-2" role="group" aria-label="How long">
          {CHOICES.map((m) => (
            <button
              key={m}
              aria-pressed={minutes === m}
              className={`flex-1 rounded-lg border px-3 py-2 text-sm ${minutes === m ? 'border-accent bg-accent font-medium text-accent-ink' : 'border-line bg-surface text-ink'}`}
              onClick={() => setMinutes(m)}
            >
              {m} min
            </button>
          ))}
        </div>
        <div className="flex justify-end gap-2">
          <button className={buttonQuiet} onClick={onCancel}>
            Cancel
          </button>
          <button className={buttonPrimary} autoFocus onClick={() => void start()}>
            Start
          </button>
        </div>
      </div>
    </div>
  );
}

const clock = (seconds: number) =>
  `${String(Math.floor(seconds / 60)).padStart(2, '0')}:${String(seconds % 60).padStart(2, '0')}`;

/**
 * The focus screen: one task, a timer and a Done button, and nothing else. Esc ends the session
 * without finishing it. Finishing earns XP for the minutes that ran.
 */
export function FocusScreen({
  session,
  sound,
  onEnded,
}: {
  session: FocusSession;
  sound: boolean;
  onEnded(): void;
}) {
  const total = session.plannedMinutes * 60;
  const [elapsed, setElapsed] = useState(() =>
    Math.max(0, Math.floor((Date.now() - Date.parse(session.startedAt)) / 1000)),
  );
  const [error, setError] = useState<string | null>(null);
  const over = elapsed >= total;

  useEffect(() => {
    const timer = setInterval(
      () =>
        setElapsed(Math.max(0, Math.floor((Date.now() - Date.parse(session.startedAt)) / 1000))),
      1000,
    );
    return () => clearInterval(timer);
  }, [session.startedAt]);

  useEffect(() => {
    if (over && sound) playChime(true);
  }, [over, sound]);

  async function finish(completed: boolean, alsoCompleteTask = false) {
    try {
      if (alsoCompleteTask && session.taskId) await window.cortex.tasks.complete(session.taskId);
      await window.cortex.focus.finish(session.id, completed);
      onEnded();
    } catch (e) {
      setError(errorMessage(e));
    }
  }

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') void finish(false);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
    // finish only reads `session`, which does not change for the life of this screen.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const left = Math.max(0, total - elapsed);
  const fraction = Math.min(1, elapsed / total);
  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label="Focus session"
      data-testid="focus-screen"
      className="fixed inset-0 z-50 flex flex-col items-center justify-center bg-ground px-6 text-center"
    >
      <p className="text-sm text-ink-muted">{over ? 'Time is up' : 'Focus'}</p>
      <h1 className="mt-3 max-w-2xl text-3xl font-semibold tracking-tight">
        {session.taskTitle ?? 'Whatever you chose'}
      </h1>
      <p data-testid="focus-timer" className="mt-8 font-mono text-7xl tabular-nums">
        {clock(left)}
      </p>
      <div
        role="progressbar"
        aria-label="Time used"
        aria-valuemin={0}
        aria-valuemax={100}
        aria-valuenow={Math.round(fraction * 100)}
        className="mt-6 h-2 w-72 overflow-hidden rounded-full bg-raised"
      >
        <div
          className="h-full rounded-full bg-brand-violet"
          style={{ width: `${fraction * 100}%` }}
        />
      </div>
      <ErrorNote message={error} />
      <div className="mt-10 flex flex-wrap justify-center gap-3">
        <button
          className={`${buttonPrimary} px-6 py-3 text-base`}
          onClick={() => void finish(true)}
        >
          Done
        </button>
        {session.taskId && (
          <button className={buttonQuiet} onClick={() => void finish(true, true)}>
            Done, and mark the task finished
          </button>
        )}
      </div>
      <p className="mt-8 text-xs text-ink-muted">Esc ends the session without finishing it.</p>
    </div>
  );
}
