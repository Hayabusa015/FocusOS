import { useCallback, useState } from 'react';
import type { Task } from '@shared/core';
import { addDays } from '@shared/dates';
import { errorMessage, useLive } from '@/hooks/useLive';
import { friendlyDate, friendlyTime, timeOfIso } from '@/lib/dates';
import { buttonPrimary, buttonQuiet, ErrorNote, inputClass } from './ui';

const STEPS = ['Wins', 'Unfinished', 'Inbox', 'Tomorrow'] as const;

/** One unfinished task and its four choices: Tomorrow, Pick a day, Someday, Done after all. */
function Unfinished({
  task,
  tomorrow,
  onError,
}: {
  task: Task;
  tomorrow: string;
  onError(m: string): void;
}) {
  const [picking, setPicking] = useState(false);
  const [day, setDay] = useState(tomorrow);
  const run = (action: () => Promise<unknown>) =>
    action().catch((e: unknown) => onError(errorMessage(e)));
  const btn = `${buttonQuiet} px-2.5 py-1 text-xs`;
  return (
    <li className="rounded-lg border border-line bg-surface p-3" data-testid="unfinished">
      <p className="text-sm font-medium">{task.title}</p>
      <div className="mt-2 flex flex-wrap items-center gap-2">
        <button
          className={btn}
          onClick={() => void run(() => window.cortex.tasks.reschedule(task.id, tomorrow))}
        >
          Tomorrow
        </button>
        {picking ? (
          <span className="flex items-center gap-2">
            <input
              type="date"
              aria-label={`Day for ${task.title}`}
              className={`${inputClass} w-40!`}
              value={day}
              min={tomorrow}
              onChange={(e) => setDay(e.target.value)}
            />
            <button
              className={btn}
              disabled={!day}
              onClick={() => void run(() => window.cortex.tasks.reschedule(task.id, day))}
            >
              Move
            </button>
          </span>
        ) : (
          <button className={btn} onClick={() => setPicking(true)}>
            Pick a day
          </button>
        )}
        <button
          className={btn}
          onClick={() =>
            void run(() => window.cortex.tasks.update({ id: task.id, status: 'someday' }))
          }
        >
          Someday
        </button>
        <button
          className={btn}
          onClick={() => void run(() => window.cortex.tasks.complete(task.id))}
        >
          Done after all
        </button>
      </div>
    </li>
  );
}

/**
 * The shutdown ritual: today's wins, one tap for each unfinished task, the inbox, and tomorrow's
 * first three. It will not finish while anything dated today is still open, and it ends with the
 * line the whole feature exists for.
 */
export function ShutdownRitual({ onClose, onSortInbox }: { onClose(): void; onSortInbox(): void }) {
  const load = useCallback(() => window.cortex.rituals.shutdown(), []);
  const { data: view, error } = useLive(load);
  const [step, setStep] = useState(0);
  const [finished, setFinished] = useState<number | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);

  async function finish() {
    try {
      const result = await window.cortex.rituals.completeShutdown();
      setFinished(result.xp);
    } catch (e) {
      setActionError(errorMessage(e));
    }
  }

  // Reopened after the day was closed: only say it is closed if nothing new is open.
  const closed = finished !== null || (view?.doneToday === true && view.unfinished.length === 0);
  const open = view?.unfinished.length ?? 0;

  return (
    <div
      className="fixed inset-0 z-50 overflow-y-auto bg-ground"
      role="dialog"
      aria-modal="true"
      aria-label="Shutdown ritual"
      data-testid="shutdown"
      onKeyDown={(e) => e.key === 'Escape' && onClose()}
    >
      <div className="mx-auto max-w-2xl px-6 py-12">
        <p className="text-sm uppercase tracking-widest text-ink-muted">Shutdown</p>
        <ErrorNote message={error ?? actionError} />
        {view && closed && (
          <div className="mt-6 text-center" data-testid="shutdown-closed">
            <h1 className="text-3xl font-semibold tracking-tight">
              Everything is captured. You can stop thinking about work.
            </h1>
            {finished !== null && finished > 0 && (
              <p className="mt-4 text-sm text-ink-muted">+{finished} XP for closing the day.</p>
            )}
            <button className={`${buttonPrimary} mt-8`} onClick={onClose}>
              Close
            </button>
          </div>
        )}
        {view && !closed && (
          <>
            <ol className="mt-2 flex gap-2 text-xs text-ink-muted" aria-label="Steps">
              {STEPS.map((name, i) => (
                <li
                  key={name}
                  className={i === step ? 'font-semibold text-ink' : ''}
                  aria-current={i === step ? 'step' : undefined}
                >
                  {i + 1}. {name}
                  {i < STEPS.length - 1 ? ' ·' : ''}
                </li>
              ))}
            </ol>

            {step === 0 && (
              <section aria-label="Today's wins" className="mt-6">
                <h1 className="text-3xl font-semibold tracking-tight">Today&apos;s wins</h1>
                {view.wins.length === 0 ? (
                  <p className="mt-3 text-sm text-ink-muted">
                    No wins logged today. Showing up counts. Let&apos;s close it out.
                  </p>
                ) : (
                  <ul className="mt-4 space-y-1.5 text-sm">
                    {view.wins.map((w) => (
                      <li key={w.id} className="flex items-baseline gap-3">
                        <span className="text-win" aria-hidden>
                          ✓
                        </span>
                        <span className="flex-1">{w.text}</span>
                        <span className="text-xs text-ink-muted">{timeOfIso(w.occurredAt)}</span>
                      </li>
                    ))}
                  </ul>
                )}
                <p className="mt-4 text-sm text-ink-muted">{view.xpToday} XP today.</p>
              </section>
            )}

            {step === 1 && (
              <section aria-label="Unfinished tasks" className="mt-6">
                <h1 className="text-3xl font-semibold tracking-tight">What is still open today</h1>
                {open === 0 ? (
                  <p className="mt-3 text-sm text-ink-muted" data-testid="none-open">
                    Nothing is left open today.
                  </p>
                ) : (
                  <>
                    <p className="mt-2 text-sm text-ink-muted">One tap each. {open} left.</p>
                    <ul className="mt-4 space-y-3">
                      {view.unfinished.map((t) => (
                        <Unfinished
                          key={t.id}
                          task={t}
                          tomorrow={addDays(view.date, 1)}
                          onError={setActionError}
                        />
                      ))}
                    </ul>
                  </>
                )}
              </section>
            )}

            {step === 2 && (
              <section aria-label="Inbox" className="mt-6">
                <h1 className="text-3xl font-semibold tracking-tight">Your inbox</h1>
                <p className="mt-3 text-sm">
                  {view.inbox === 0
                    ? 'Empty. Nothing waiting to be sorted.'
                    : `${view.inbox} ${view.inbox === 1 ? 'thing is' : 'things are'} waiting to be sorted.`}
                </p>
                {view.inbox > 0 && (
                  <button className={`${buttonQuiet} mt-4`} onClick={onSortInbox}>
                    Sort it now
                  </button>
                )}
              </section>
            )}

            {step === 3 && (
              <section aria-label="Tomorrow" className="mt-6">
                <h1 className="text-3xl font-semibold tracking-tight">
                  Tomorrow&apos;s first three
                </h1>
                <p className="mt-1 text-sm text-ink-muted">
                  {friendlyDate(view.tomorrowDate, view.date)}
                </p>
                {view.tomorrow.length === 0 ? (
                  <p className="mt-3 text-sm text-ink-muted">Nothing planned yet. That is fine.</p>
                ) : (
                  <ol className="mt-4 space-y-2 text-sm">
                    {view.tomorrow.map((t, i) => (
                      <li key={t.id}>
                        <span className="mr-2 text-ink-muted">{i + 1}.</span>
                        {t.title}
                        {t.dueTime && (
                          <span className="ml-2 text-xs text-ink-muted">
                            {friendlyTime(t.dueTime)}
                          </span>
                        )}
                      </li>
                    ))}
                  </ol>
                )}
              </section>
            )}

            <div className="mt-10 flex items-center justify-between">
              <button
                className={buttonQuiet}
                onClick={step === 0 ? onClose : () => setStep(step - 1)}
              >
                {step === 0 ? 'Not now' : 'Back'}
              </button>
              {step < STEPS.length - 1 ? (
                <button
                  className={buttonPrimary}
                  disabled={step === 1 && open > 0}
                  title={step === 1 && open > 0 ? 'Give each open task a home first' : undefined}
                  onClick={() => setStep(step + 1)}
                >
                  Next
                </button>
              ) : (
                <button className={buttonPrimary} disabled={open > 0} onClick={() => void finish()}>
                  Close the day
                </button>
              )}
            </div>
          </>
        )}
      </div>
    </div>
  );
}
