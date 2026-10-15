import { useCallback, useState } from 'react';
import { PlanDialog } from '@/components/atlas/PlanDialog';
import { DayGauge } from '@/components/DayGauge';
import { Schedule } from '@/components/Schedule';
import {
  ErrorNote,
  Segments,
  SectionTitle,
  Sheet,
  buttonPrimary,
  buttonQuiet,
  buttonViolet,
} from '@/components/ui';
import { DailyList } from '@/components/DailyList';
import { useLive } from '@/hooks/useLive';
import { areaColor, indexAreas } from '@/lib/areas';
import { friendlyDate, minutesText } from '@/lib/dates';
import { greeting } from '@/lib/format';
import type { PageProps } from './types';
import { LevelBar, StreakDots } from './WinsPage';

/** One number of the day with a row of bars under it. Pressing it goes to where it lives. */
function Stat({
  label,
  value,
  note,
  onClick,
  testId,
  bars,
}: {
  label: string;
  value: string;
  note?: string;
  onClick?: () => void;
  testId: string;
  bars?: React.ReactNode;
}) {
  return (
    <button
      data-testid={testId}
      onClick={onClick}
      className="flex flex-col items-stretch gap-2 text-left transition-colors hover:text-accent-soft"
    >
      <span className="flex items-baseline gap-2">
        <span className="text-3xl font-bold tabular-nums tracking-tight">{value}</span>
        <span className="text-sm font-medium">{label}</span>
      </span>
      {bars}
      {note && <span className="text-xs text-ink-muted">{note}</span>}
    </button>
  );
}

/** The home screen: where the day stands, today's list, what is coming, and each area at a glance. */
export function DashboardPage({ areas, openTask, newTask, go, focus }: PageProps) {
  const loadToday = useCallback(() => window.cortex.today.get(), []);
  const loadUpcoming = useCallback(() => window.cortex.upcoming.get(), []);
  const loadInbox = useCallback(() => window.cortex.tasks.list({ view: 'inbox' }), []);
  const loadMaintenance = useCallback(() => window.cortex.maintenance.list(), []);
  const loadSummary = useCallback(() => window.cortex.accomplishments.summary(), []);
  const { data: today, error } = useLive(loadToday, 30_000);
  const { data: upcoming } = useLive(loadUpcoming);
  const { data: inbox } = useLive(loadInbox);
  const { data: maintenance } = useLive(loadMaintenance);
  const { data: summary } = useLive(loadSummary);
  const byId = indexAreas(areas);
  const now = new Date();
  const [planning, setPlanning] = useState(false);

  const comingUp = (upcoming?.days ?? [])
    .filter((d) => d.date !== null && d.date !== today?.date)
    .flatMap((d) => d.tasks.map((t) => ({ task: t, date: d.date as string })))
    .slice(0, 6);
  const needsAttention = (maintenance ?? []).filter(
    (m) => m.state === 'overdue' || m.state === 'due-soon',
  );

  return (
    <div>
      <header className="mb-6 flex items-start justify-between gap-4">
        <div>
          <h1 className="text-4xl font-bold tracking-tight">{greeting(now)}</h1>
          <p className="mt-1 text-ink-muted">
            {now.toLocaleDateString([], { weekday: 'long', month: 'long', day: 'numeric' })}
          </p>
        </div>
        <div className="flex gap-2">
          <button className={buttonQuiet} onClick={() => focus(null)}>
            Start a focus session
          </button>
          <button className={buttonViolet} onClick={() => setPlanning(true)}>
            Plan the rest of today
          </button>
          <button className={buttonPrimary} onClick={() => newTask()}>
            Add task
          </button>
        </div>
      </header>
      <ErrorNote message={error} />
      {planning && <PlanDialog onClose={() => setPlanning(false)} />}

      {today && (
        <>
          <Sheet label="Today at a glance" className="mb-6">
            <SectionTitle>Today at a glance</SectionTitle>
            <div className="grid items-center gap-8 md:grid-cols-[17rem_1fr]">
              <DayGauge today={today} />
              <div className="grid gap-x-10 gap-y-6 sm:grid-cols-2">
                <div className="flex flex-col gap-2">
                  <Stat
                    testId="tile-today"
                    label="tasks"
                    value={`${today.counters.tasksDone} of ${today.counters.tasksTotal}`}
                    bars={
                      <Segments done={today.counters.tasksDone} total={today.counters.tasksTotal} />
                    }
                    onClick={() => go({ page: 'today' })}
                  />
                  <button
                    data-testid="tile-due"
                    onClick={() => go({ page: 'today' })}
                    className="self-start text-xs text-ink-muted hover:text-accent-soft"
                  >
                    {today.dueToday.length} left
                    {today.carryForward.length > 0 &&
                      ` · ${today.carryForward.length} carried forward`}
                  </button>
                </div>
                <Stat
                  testId="tile-blocks"
                  label="blocks"
                  value={`${today.counters.blocksDone} of ${today.counters.blocksTotal}`}
                  bars={
                    <Segments
                      done={today.counters.blocksDone}
                      total={today.counters.blocksTotal}
                      fill="bg-area-chemistry"
                      glow="glow-blue"
                    />
                  }
                  note={
                    today.nowBlock
                      ? 'one in progress'
                      : today.counters.blocksTotal === 0
                        ? 'nothing scheduled'
                        : undefined
                  }
                  onClick={() => go({ page: 'today' })}
                />
                <Stat
                  testId="tile-inbox"
                  label="in your inbox"
                  value={String(inbox?.length ?? 0)}
                  note="to sort"
                  onClick={() => go({ page: 'inbox' })}
                />
                <Stat
                  testId="tile-xp"
                  label="XP today"
                  value={String(today.counters.xpToday)}
                  bars={
                    <Segments
                      done={Math.min(today.counters.winsToday, 3)}
                      total={3}
                      fill="bg-accent"
                      glow="glow-gold"
                    />
                  }
                  note={`${today.counters.winsToday} ${today.counters.winsToday === 1 ? 'win' : 'wins'} (3 make an active day)`}
                  onClick={() => go({ page: 'wins' })}
                />
              </div>
            </div>
          </Sheet>

          <Sheet label="Schedule" className="mb-6">
            <SectionTitle
              hint={
                today.nextBlock
                  ? `Next: ${today.nextBlock.title} in ${minutesText(today.nextBlock.startsInMinutes)}`
                  : undefined
              }
            >
              Schedule
            </SectionTitle>
            {today.blocks.length > 0 ? (
              <Schedule today={today} areas={areas} openTask={openTask} />
            ) : (
              <p className="text-sm text-ink-muted">
                Nothing scheduled right now. Use Plan the rest of today to fit your tasks into the
                time you have left.
              </p>
            )}
            {today.nowBlock && (
              <p className="sr-only">
                Now: {today.nowBlock.title}, {minutesText(today.nowBlock.minutesLeft)} left
              </p>
            )}
          </Sheet>

          <div className="mb-8 grid gap-8 lg:grid-cols-[3fr_2fr]">
            <Sheet label="Today's list">
              <SectionTitle hint="Tick things off as you go">Today&apos;s list</SectionTitle>
              <DailyList
                today={today}
                areas={areas}
                openTask={openTask}
                onFocus={(t) => focus(t.id)}
              />
            </Sheet>

            <div className="space-y-8">
              <section aria-label="Coming up">
                <SectionTitle>Coming up</SectionTitle>
                {comingUp.length === 0 ? (
                  <p className="text-sm text-ink-muted">Nothing due in the next two weeks.</p>
                ) : (
                  <ul className="divide-y divide-line border-y border-line">
                    {comingUp.map(({ task, date }) => (
                      <li key={task.id}>
                        <button
                          className="flex w-full items-baseline justify-between gap-3 py-2 text-left text-sm hover:text-accent-soft"
                          onClick={() => openTask(task.id)}
                        >
                          <span className="truncate">{task.title}</span>
                          <span className="shrink-0 text-xs text-ink-muted">
                            {friendlyDate(date, today.date)}
                          </span>
                        </button>
                      </li>
                    ))}
                  </ul>
                )}
              </section>

              <section aria-label="Home maintenance">
                <SectionTitle>Home maintenance</SectionTitle>
                {needsAttention.length === 0 ? (
                  <p className="text-sm text-ink-muted">Nothing is due soon.</p>
                ) : (
                  <ul className="divide-y divide-line border-y border-line">
                    {needsAttention.map((m) => (
                      <li key={m.id}>
                        <button
                          className="w-full py-2 text-left hover:text-accent-soft"
                          onClick={() => go({ page: 'maintenance' })}
                        >
                          <span className="block text-sm">{m.name}</span>
                          <span className="text-xs text-ink-muted">{m.statusText}</span>
                        </button>
                      </li>
                    ))}
                  </ul>
                )}
              </section>

              {summary && (
                <button
                  data-testid="progress-card"
                  onClick={() => go({ page: 'wins' })}
                  className="grid w-full gap-4 border-t border-line pt-4 text-left"
                >
                  <LevelBar summary={summary} />
                  <div className="flex items-center justify-between gap-3">
                    <span className="text-sm font-medium">Active days this week</span>
                    <StreakDots summary={summary} />
                  </div>
                </button>
              )}
            </div>
          </div>
        </>
      )}

      <section aria-label="Areas">
        <SectionTitle>Areas</SectionTitle>
        <div className="grid grid-cols-2 gap-x-6 gap-y-1 lg:grid-cols-4">
          {areas.map((area) => (
            <button
              key={area.id}
              data-testid={`area-card-${area.name}`}
              className="border-l-[3px] py-2 pl-3 text-left transition-colors hover:bg-raised"
              style={{ borderLeftColor: areaColor(byId.get(area.id)) }}
              onClick={() => go({ page: 'area', areaId: area.id })}
            >
              <span className="block truncate text-sm font-semibold">{area.name}</span>
              <span className="text-xs text-ink-muted">
                {area.openCount} open · {area.doneThisWeek} done this week
              </span>
            </button>
          ))}
        </div>
      </section>
    </div>
  );
}
