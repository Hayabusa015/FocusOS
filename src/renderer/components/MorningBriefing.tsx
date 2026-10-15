import { useCallback, useState } from 'react';
import type { Task } from '@shared/core';
import { errorMessage, useLive } from '@/hooks/useLive';
import { friendlyDate, friendlyTime } from '@/lib/dates';
import { greeting } from '@/lib/format';
import { buttonQuiet, ErrorNote, SectionTitle } from './ui';

function Rows({ tasks, today }: { tasks: Task[]; today: string }) {
  return (
    <ul className="space-y-1 text-sm">
      {tasks.map((t) => (
        <li key={t.id} className="flex items-baseline justify-between gap-3">
          <span className="truncate">{t.title}</span>
          <span className="shrink-0 text-xs text-ink-muted">
            {t.dueDate && t.dueDate !== today ? friendlyDate(t.dueDate, today) : ''}
            {t.dueTime ? ` ${friendlyTime(t.dueTime)}` : ''}
          </span>
        </li>
      ))}
    </ul>
  );
}

/**
 * The morning briefing: what the day holds, from local data only, ending with "Pick your first
 * thing". Picking moves that task to the top of today and marks it as the one you are on.
 */
export function MorningBriefing({ onClose }: { onClose(): void }) {
  const load = useCallback(() => window.cortex.rituals.briefing(), []);
  const { data: view, error } = useLive(load);
  const [actionError, setActionError] = useState<string | null>(null);

  async function close() {
    await window.cortex.rituals.briefingShown().catch(() => undefined);
    onClose();
  }

  async function pick(task: Task) {
    if (!view) return;
    try {
      if (task.dueDate !== null && task.dueDate < view.date) {
        await window.cortex.tasks.reschedule(task.id, view.date);
      }
      await window.cortex.tasks.update({ id: task.id, status: 'doing' });
      const others = view.dueToday.filter((t) => t.id !== task.id).map((t) => t.id);
      if (view.dueToday.some((t) => t.id === task.id) && view.dueToday[0]?.id !== task.id) {
        await window.cortex.tasks.reorder([task.id, ...others]);
      }
      await close();
    } catch (e) {
      setActionError(errorMessage(e));
    }
  }

  return (
    <div
      className="fixed inset-0 z-50 overflow-y-auto bg-ground"
      role="dialog"
      aria-modal="true"
      aria-label="Morning briefing"
      data-testid="briefing"
      onKeyDown={(e) => e.key === 'Escape' && void close()}
    >
      <div className="mx-auto max-w-2xl px-6 py-12">
        <p className="text-sm text-ink-muted">Morning briefing</p>
        <h1 className="mt-1 text-3xl font-semibold tracking-tight">{greeting(new Date())}</h1>
        <ErrorNote message={error ?? actionError} />
        {view && (
          <div className="mt-6 space-y-6">
            <section aria-label="Due today">
              <SectionTitle hint={`${view.dueToday.length}`}>Due today</SectionTitle>
              {view.dueToday.length === 0 ? (
                <p className="text-sm text-ink-muted">Nothing is due today.</p>
              ) : (
                <Rows tasks={view.dueToday} today={view.date} />
              )}
            </section>
            {view.carryForward.length > 0 && (
              <section aria-label="Carried forward">
                <SectionTitle hint="From earlier days. No pressure.">Carried forward</SectionTitle>
                <Rows tasks={view.carryForward} today={view.date} />
              </section>
            )}
            {view.maintenance.length > 0 && (
              <section aria-label="Home maintenance">
                <SectionTitle>Home maintenance</SectionTitle>
                <ul className="space-y-1 text-sm">
                  {view.maintenance.map((m) => (
                    <li key={m.id}>
                      {m.name} <span className="text-xs text-ink-muted">· {m.statusText}</span>
                    </li>
                  ))}
                </ul>
              </section>
            )}
            {view.inbox > 0 && (
              <p className="text-sm text-ink-muted">
                {view.inbox} {view.inbox === 1 ? 'thing' : 'things'} waiting in your inbox.
              </p>
            )}

            <section
              aria-label="Pick your first thing"
              className="rounded-card border border-line bg-surface p-5"
            >
              <h2 className="text-lg font-semibold">Pick your first thing</h2>
              {view.picks.length === 0 ? (
                <p className="mt-2 text-sm text-ink-muted">
                  Nothing to pick from. Add a task, or enjoy the quiet.
                </p>
              ) : (
                <div className="mt-3 grid gap-2">
                  {view.picks.map((t) => (
                    <button
                      key={t.id}
                      className="rounded-lg border border-line bg-surface px-4 py-3 text-left text-sm transition-colors hover:border-accent hover:bg-raised"
                      onClick={() => void pick(t)}
                    >
                      {t.title}
                    </button>
                  ))}
                </div>
              )}
            </section>
            <div className="flex justify-end">
              <button className={buttonQuiet} onClick={() => void close()}>
                Not now
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
