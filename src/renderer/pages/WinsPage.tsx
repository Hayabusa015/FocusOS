import { useCallback, useState } from 'react';
import { isoToLocalDate } from '@shared/dates';
import type { GamificationSummary } from '@shared/core';
import { Card, Empty, ErrorNote, SectionTitle, buttonPrimary, inputClass } from '@/components/ui';
import { errorMessage, useLive } from '@/hooks/useLive';
import { friendlyDate, timeOfIso } from '@/lib/dates';

/** "Level 3" or "Warming up" before the first 100 XP. */
export const levelName = (level: number): string => (level === 0 ? 'Warming up' : `Level ${level}`);

export function LevelBar({ summary }: { summary: GamificationSummary }) {
  return (
    <div>
      <div className="mb-1 flex items-baseline justify-between gap-3">
        <span className="font-semibold">{levelName(summary.level)}</span>
        <span className="text-xs text-ink-muted">
          {summary.xpIntoLevel} / {summary.xpForNext} XP to {levelName(summary.level + 1)}
        </span>
      </div>
      <div
        role="progressbar"
        aria-label="Progress to the next level"
        aria-valuemin={0}
        aria-valuemax={100}
        aria-valuenow={Math.round(summary.progress * 100)}
        className="h-2.5 overflow-hidden rounded-full bg-raised"
      >
        <div
          className="h-full rounded-full bg-accent"
          style={{ width: `${Math.max(2, summary.progress * 100)}%` }}
        />
      </div>
    </div>
  );
}

/** "5 / 7" with a dot for each of the last seven days. */
export function StreakDots({ summary }: { summary: GamificationSummary }) {
  return (
    <div className="flex items-center gap-3">
      <span data-testid="streak" className="text-2xl font-semibold tracking-tight">
        {summary.streak.active} / {summary.streak.of}
      </span>
      <span className="flex gap-1.5" aria-hidden>
        {summary.streak.days.map((d) => (
          <span
            key={d.date}
            title={`${friendlyDate(d.date)}: ${d.wins} ${d.wins === 1 ? 'win' : 'wins'}`}
            className={`size-3 rounded-full ${d.active ? 'bg-accent' : 'bg-line'}`}
          />
        ))}
      </span>
    </div>
  );
}

export function WinsPage() {
  const load = useCallback(() => window.cortex.accomplishments.wins(), []);
  const { data, error } = useLive(load);
  const [text, setText] = useState('');
  const [actionError, setActionError] = useState<string | null>(null);

  if (!data) return <ErrorNote message={error} />;
  const { summary, achievements } = data;
  const maxWins = Math.max(3, ...data.week.map((d) => d.wins));

  return (
    <div>
      <header className="mb-6">
        <h1 className="text-3xl font-semibold tracking-tight">Wins</h1>
        <p className="mt-1 text-ink-muted">Everything you have gotten done, counted.</p>
      </header>
      <ErrorNote message={error ?? actionError} />

      <div className="mb-4 grid gap-4 lg:grid-cols-2">
        <Card label="Level">
          <SectionTitle hint={`${summary.totalXp} XP in all`}>Level</SectionTitle>
          <LevelBar summary={summary} />
          <p className="mt-3 text-sm text-ink-muted" data-testid="xp-today">
            {summary.xpToday} XP today · {summary.winsToday}{' '}
            {summary.winsToday === 1 ? 'win' : 'wins'}
          </p>
        </Card>
        <Card label="Streak">
          <SectionTitle hint="3 wins make an active day">Active days this week</SectionTitle>
          <StreakDots summary={summary} />
          <p className="mt-3 text-sm text-ink-muted">
            A missed day costs one day, never the whole count.
          </p>
        </Card>
      </div>

      <Card label="This week" className="mb-4">
        <SectionTitle>This week</SectionTitle>
        <div className="flex h-28 items-end gap-3">
          {data.week.map((d) => (
            <div key={d.date} className="flex flex-1 flex-col items-center gap-1">
              <span className="text-xs text-ink-muted">{d.wins}</span>
              <div className="flex h-16 w-full items-end">
                <div
                  className={`w-full rounded-t-md ${d.active ? 'bg-accent' : 'bg-line'}`}
                  style={{ height: `${Math.max(4, (d.wins / maxWins) * 100)}%` }}
                />
              </div>
              <span className="text-xs text-ink-muted">
                {new Date(`${d.date}T12:00:00`).toLocaleDateString([], { weekday: 'short' })}
              </span>
            </div>
          ))}
        </div>
      </Card>

      <Card label="Today's wins" className="mb-4">
        <SectionTitle hint={`${data.todayWins.length}`}>Today&apos;s wins</SectionTitle>
        {data.todayWins.length === 0 ? (
          <p className="text-sm text-ink-muted">Nothing yet today. The first one is the hardest.</p>
        ) : (
          <ul className="space-y-1">
            {data.todayWins.map((w) => (
              <li key={w.id} className="flex items-baseline gap-3 text-sm">
                <span className="text-win" aria-hidden>
                  ✓
                </span>
                <span className="flex-1">{w.text}</span>
                <span className="text-xs text-ink-muted">{timeOfIso(w.occurredAt)}</span>
              </li>
            ))}
          </ul>
        )}
        <form
          className="mt-4 flex gap-2"
          onSubmit={(e) => {
            e.preventDefault();
            const value = text.trim();
            if (!value) return;
            setText('');
            setActionError(null);
            window.cortex.accomplishments
              .logWin(value)
              .catch((err: unknown) => setActionError(errorMessage(err)));
          }}
        >
          <input
            className={inputClass}
            aria-label="Log a win in your own words"
            placeholder="Log a win in your own words, like “handled a tough parent call”"
            maxLength={300}
            value={text}
            onChange={(e) => setText(e.target.value)}
          />
          <button className={`${buttonPrimary} whitespace-nowrap`} disabled={!text.trim()}>
            Log it
          </button>
        </form>
      </Card>

      {data.recent.length > 0 && (
        <Card label="Earlier this week" className="mb-4">
          <SectionTitle>Earlier this week</SectionTitle>
          <div className="space-y-3">
            {data.recent.map((day) => (
              <div key={day.date}>
                <h3 className="mb-1 text-xs font-semibold uppercase tracking-wide text-ink-muted">
                  {friendlyDate(day.date)}
                </h3>
                <ul className="space-y-0.5 text-sm">
                  {day.wins.map((w) => (
                    <li key={w.id}>
                      <span className="mr-2 text-win" aria-hidden>
                        ✓
                      </span>
                      {w.text}
                    </li>
                  ))}
                </ul>
              </div>
            ))}
          </div>
        </Card>
      )}

      <section aria-label="Achievements">
        <SectionTitle hint={`${summary.achievementsUnlocked} of ${summary.achievementsTotal}`}>
          Achievements
        </SectionTitle>
        {achievements.length === 0 && <Empty title="No achievements yet" />}
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {achievements.map((a) => (
            <div
              key={a.key}
              data-testid={`achievement-${a.key}`}
              data-unlocked={a.unlockedAt !== null}
              className={`rounded-card border p-4 ${a.unlockedAt ? 'border-accent bg-surface' : 'border-line bg-surface opacity-60'}`}
            >
              <div className="flex items-center gap-2">
                <span
                  aria-hidden
                  className={`grid size-6 place-items-center rounded-full text-xs ${a.unlockedAt ? 'bg-accent text-accent-ink' : 'bg-line text-ink-muted'}`}
                >
                  {a.unlockedAt ? '✓' : '·'}
                </span>
                <span className="font-medium">{a.title}</span>
              </div>
              <p className="mt-1 text-sm text-ink-muted">{a.description}</p>
              {a.unlockedAt && (
                <p className="mt-1 text-xs text-ink-muted">
                  Unlocked {friendlyDate(isoToLocalDate(a.unlockedAt))}
                </p>
              )}
            </div>
          ))}
        </div>
      </section>
    </div>
  );
}
