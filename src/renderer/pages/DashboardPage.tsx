import { useCallback } from 'react';
import { Card, ErrorNote, Ring, SectionTitle, buttonPrimary } from '@/components/ui';
import { DailyList } from '@/components/DailyList';
import { useLive } from '@/hooks/useLive';
import { areaColor, indexAreas } from '@/lib/areas';
import { friendlyDate, minutesText } from '@/lib/dates';
import { greeting } from '@/lib/format';
import type { PageProps } from './types';

function Tile({
  label,
  value,
  note,
  onClick,
  testId,
}: {
  label: string;
  value: string;
  note?: string;
  onClick?: () => void;
  testId: string;
}) {
  return (
    <button
      data-testid={testId}
      onClick={onClick}
      className="flex flex-col items-start justify-start rounded-card border border-line bg-surface p-4 text-left transition-colors hover:bg-raised"
    >
      <span className="block text-xs font-semibold uppercase tracking-wide text-ink-muted">
        {label}
      </span>
      <span className="mt-1 block text-3xl font-semibold tracking-tight">{value}</span>
      {note && <span className="mt-0.5 block text-xs text-ink-muted">{note}</span>}
    </button>
  );
}

/** The home screen: where the day stands, today's list, what is coming, and each area at a glance. */
export function DashboardPage({ areas, openTask, newTask, go }: PageProps) {
  const loadToday = useCallback(() => window.cortex.today.get(), []);
  const loadUpcoming = useCallback(() => window.cortex.upcoming.get(), []);
  const loadInbox = useCallback(() => window.cortex.tasks.list({ view: 'inbox' }), []);
  const loadMaintenance = useCallback(() => window.cortex.maintenance.list(), []);
  const { data: today, error } = useLive(loadToday, 30_000);
  const { data: upcoming } = useLive(loadUpcoming);
  const { data: inbox } = useLive(loadInbox);
  const { data: maintenance } = useLive(loadMaintenance);
  const byId = indexAreas(areas);
  const now = new Date();

  const weekDone = areas.reduce((sum, a) => sum + a.doneThisWeek, 0);
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
          <h1 className="text-3xl font-semibold tracking-tight">{greeting(now)}</h1>
          <p className="mt-1 text-ink-muted">
            {now.toLocaleDateString([], { weekday: 'long', month: 'long', day: 'numeric' })}
          </p>
        </div>
        <button className={buttonPrimary} onClick={() => newTask()}>
          Add task
        </button>
      </header>
      <ErrorNote message={error} />

      {today && (
        <>
          <div className="mb-4 grid grid-cols-2 gap-3 lg:grid-cols-4">
            <Tile
              testId="tile-today"
              label="Done today"
              value={`${today.counters.tasksDone} of ${today.counters.tasksTotal}`}
              note={
                today.arc.phase === 'during'
                  ? `${minutesText(today.arc.minutesLeft)} left in your day`
                  : undefined
              }
              onClick={() => go({ page: 'today' })}
            />
            <Tile
              testId="tile-due"
              label="Still to do today"
              value={String(today.dueToday.length)}
              note={
                today.carryForward.length > 0
                  ? `${today.carryForward.length} carried forward`
                  : undefined
              }
              onClick={() => go({ page: 'today' })}
            />
            <Tile
              testId="tile-inbox"
              label="In your inbox"
              value={String(inbox?.length ?? 0)}
              note="to sort"
              onClick={() => go({ page: 'inbox' })}
            />
            <Tile testId="tile-week" label="Done this week" value={String(weekDone)} />
          </div>

          <Card label="Now and next" className="mb-4">
            {today.nowBlock ? (
              <p>
                <span className="text-xs font-semibold uppercase tracking-wide text-accent-soft">
                  Now
                </span>
                <span className="ml-3 text-lg font-medium">{today.nowBlock.title}</span>
                <span className="ml-3 text-sm text-ink-muted">
                  {minutesText(today.nowBlock.minutesLeft)} left
                </span>
              </p>
            ) : (
              <p className="text-ink-muted">Nothing scheduled right now.</p>
            )}
            {today.nextBlock && (
              <p className="mt-2 text-sm text-ink-muted">
                <span className="text-xs font-semibold uppercase tracking-wide">Next</span>
                <span className="ml-3 text-ink">{today.nextBlock.title}</span>
                <span className="ml-3">in {minutesText(today.nextBlock.startsInMinutes)}</span>
              </p>
            )}
          </Card>

          <div className="mb-6 grid gap-4 lg:grid-cols-[3fr_2fr]">
            <Card label="Today's list">
              <SectionTitle hint="Tick things off as you go">Today&apos;s list</SectionTitle>
              <DailyList today={today} areas={areas} openTask={openTask} />
            </Card>

            <div className="space-y-4">
              <Card label="Coming up">
                <SectionTitle>Coming up</SectionTitle>
                {comingUp.length === 0 ? (
                  <p className="text-sm text-ink-muted">Nothing due in the next two weeks.</p>
                ) : (
                  <ul className="space-y-1">
                    {comingUp.map(({ task, date }) => (
                      <li key={task.id}>
                        <button
                          className="flex w-full items-baseline justify-between gap-3 rounded-lg px-2 py-1.5 text-left text-sm hover:bg-raised"
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
              </Card>

              <Card label="Home maintenance">
                <SectionTitle>Home maintenance</SectionTitle>
                {needsAttention.length === 0 ? (
                  <p className="text-sm text-ink-muted">Nothing is due soon.</p>
                ) : (
                  <ul className="space-y-1">
                    {needsAttention.map((m) => (
                      <li key={m.id}>
                        <button
                          className="w-full rounded-lg px-2 py-1.5 text-left hover:bg-raised"
                          onClick={() => go({ page: 'maintenance' })}
                        >
                          <span className="block text-sm">{m.name}</span>
                          <span className="text-xs text-ink-muted">{m.statusText}</span>
                        </button>
                      </li>
                    ))}
                  </ul>
                )}
              </Card>
            </div>
          </div>
        </>
      )}

      <section aria-label="Areas">
        <SectionTitle>Areas</SectionTitle>
        <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
          {areas.map((area) => (
            <button
              key={area.id}
              data-testid={`area-card-${area.name}`}
              className="flex items-center gap-3 rounded-card border border-line bg-surface p-4 text-left transition-colors hover:bg-raised"
              onClick={() => go({ page: 'area', areaId: area.id })}
            >
              <Ring
                size={40}
                done={area.doneThisWeek}
                total={area.doneThisWeek + area.openCount}
                color={areaColor(byId.get(area.id))}
              />
              <span className="min-w-0">
                <span className="block truncate text-sm font-medium">{area.name}</span>
                <span className="text-xs text-ink-muted">
                  {area.openCount} open · {area.doneThisWeek} done this week
                </span>
              </span>
            </button>
          ))}
        </div>
      </section>
    </div>
  );
}
