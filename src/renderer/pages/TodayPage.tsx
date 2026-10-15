import { useCallback, useState } from 'react';
import { Schedule } from '@/components/Schedule';
import { PlanDialog } from '@/components/atlas/PlanDialog';
import { ErrorNote, buttonQuiet } from '@/components/ui';
import { PulseLists } from '@/components/PulseLists';
import { PulseProgress } from '@/components/PulseProgress';
import { PulseIcon } from '@/components/PulseIcon';
import { TaskList } from '@/components/TaskList';
import { useLive, errorMessage } from '@/hooks/useLive';
import { minutesText } from '@/lib/dates';
import type { PageProps } from './types';
export function TodayPage({ areas, openTask, focus, shutdown }: PageProps) {
  const load = useCallback(() => window.cortex.today.get(), []);
  const { data: today, error } = useLive(load, 30_000);
  const [actionError, setActionError] = useState<string | null>(null),
    [planning, setPlanning] = useState(false),
    [areaId, setAreaId] = useState('');
  const allTasks = [...(today?.dueToday ?? []), ...(today?.doneToday ?? [])].sort(
    (a, b) => a.sortOrder - b.sortOrder || a.id.localeCompare(b.id),
  );
  const tasks = allTasks.filter((t) => !areaId || t.areaId === areaId),
    next = tasks.find((t) => t.status !== 'done');
  const filteredToday = today && {
    ...today,
    blocks: today.blocks.filter((t) => !areaId || t.areaId === areaId),
  };
  return (
    <div className="pulse-today">
      <header className="pulse-page-heading">
        <div>
          <p className="pulse-date">
            {new Date().toLocaleDateString([], { weekday: 'long', month: 'long', day: 'numeric' })}
          </p>
          <h1>Today</h1>
          <p>Your lists. Your rhythm. Every little win adds up.</p>
        </div>
        <select
          className="pulse-filter"
          aria-label="Filter by area"
          value={areaId}
          onChange={(e) => setAreaId(e.target.value)}
        >
          <option value="">All areas</option>
          {areas.map((a) => (
            <option key={a.id} value={a.id}>
              {a.name}
            </option>
          ))}
        </select>
      </header>
      <ErrorNote message={error ?? actionError} />
      {planning && <PlanDialog onClose={() => setPlanning(false)} />}
      {!today && !error && (
        <p role="status" className="text-ink-muted">
          Loading your day…
        </p>
      )}
      {today && (
        <div className="pulse-layout">
          <div>
            <PulseProgress tasks={tasks} xp={today.counters.xpToday} />
            <div data-testid="daily-list">
              <PulseLists
                tasks={tasks}
                areas={areas}
                onOpen={openTask}
                onFocus={focus}
                addLabel="Add to today and press Enter"
                onAdd={(title) =>
                  window.cortex.tasks.create({ title, dueDate: today.date, areaId: areaId || null })
                }
              />
            </div>
            {today.carryForward.filter((t) => !areaId || t.areaId === areaId).length > 0 && (
              <section className="pulse-carried">
                <h2>Carried forward</h2>
                <p>Move what still matters. The rest can wait.</p>
                <TaskList
                  tasks={today.carryForward.filter((t) => !areaId || t.areaId === areaId)}
                  areas={areas}
                  onOpen={openTask}
                  onError={setActionError}
                  trailing={(t) => (
                    <button
                      className={buttonQuiet}
                      onClick={() =>
                        void window.cortex.tasks
                          .reschedule(t.id, today.date)
                          .catch((e: unknown) => setActionError(errorMessage(e)))
                      }
                    >
                      Move to today
                    </button>
                  )}
                />
              </section>
            )}
          </div>
          <aside className="pulse-day-aside" aria-label="Focus and schedule">
            <section className="pulse-focus-card">
              <span>Your next step</span>
              <h2>{next?.title ?? 'A little room to breathe.'}</h2>
              <p>{next ? 'Just this one thing.' : 'Capture a thought or add your first list.'}</p>
              <button className="btn pulse-focus-button" onClick={() => focus(next?.id)}>
                <PulseIcon name="play" />
                Start focusing
              </button>
            </section>
            <div className="pulse-schedule-heading">
              <h2>Your day</h2>
              <button onClick={() => setPlanning(true)}>Plan the rest of today</button>
            </div>
            {today.nowBlock && (
              <p className="pulse-now" data-testid="now-bar">
                Now: {today.nowBlock.title} · {minutesText(today.nowBlock.minutesLeft)} left
              </p>
            )}
            {filteredToday && filteredToday.blocks.length > 0 ? (
              <Schedule today={filteredToday} areas={areas} openTask={openTask} />
            ) : (
              <p className="pulse-empty">Nothing scheduled here. Some room to think.</p>
            )}
            <div className="pulse-day-end">
              <span>
                {today.arc.phase === 'during'
                  ? `${minutesText(today.arc.minutesLeft)} left in your day`
                  : today.arc.phase === 'before'
                    ? `Your day starts at ${today.dayStart}`
                    : 'The day is done. Anything left can wait.'}
              </span>
              <button onClick={shutdown}>
                Wrap up your day <PulseIcon name="chevron" />
              </button>
            </div>
          </aside>
        </div>
      )}
    </div>
  );
}
