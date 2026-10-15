import type { TodayView } from '@shared/core';
import { minutesText, timeOfIso } from '@/lib/dates';
import { friendlyTime } from '@/lib/dates';

const R = 80;
const point = (f: number) => ({
  x: 100 - R * Math.cos(Math.PI * f),
  y: 100 - R * Math.sin(Math.PI * f),
});

/**
 * Where you are in the day window, as a half-circle gauge: the arc fills as the day passes, with
 * a gold marker at now. It shows the time, and what is left, in plain words.
 */
export function DayGauge({ today }: { today: TodayView }) {
  const f = Math.min(1, Math.max(0, today.arc.fraction));
  const end = point(f);
  const caption =
    today.arc.phase === 'before'
      ? `Your day starts at ${friendlyTime(today.dayStart)}`
      : today.arc.phase === 'after'
        ? 'The day is done'
        : `${minutesText(today.arc.minutesLeft)} to your day's end`;
  return (
    <div
      role="img"
      aria-label={`Your day window: ${caption}`}
      data-testid="day-gauge"
      className="relative mx-auto w-full max-w-[17rem]"
    >
      <svg viewBox="0 0 200 118" className="w-full" aria-hidden>
        <path
          d={`M ${100 - R} 100 A ${R} ${R} 0 0 1 ${100 + R} 100`}
          fill="none"
          strokeWidth="9"
          strokeLinecap="round"
          className="stroke-raised"
        />
        {f > 0.005 && (
          <path
            d={`M ${100 - R} 100 A ${R} ${R} 0 0 1 ${end.x} ${end.y}`}
            fill="none"
            strokeWidth="9"
            strokeLinecap="round"
            className="glow-arc stroke-brand-violet"
          />
        )}
        {today.arc.phase === 'during' && (
          <circle
            cx={end.x}
            cy={end.y}
            r="6"
            className="glow-dot fill-accent stroke-surface"
            strokeWidth="3"
          />
        )}
      </svg>
      <div className="absolute inset-x-0 top-[44%] text-center">
        <p className="font-display text-4xl font-bold tracking-tight">{timeOfIso(today.nowIso)}</p>
        <p className="mt-0.5 text-xs text-ink-muted">{caption}</p>
      </div>
      <div className="mt-1 flex justify-between text-xs tabular-nums text-ink-muted">
        <span>{friendlyTime(today.dayStart)}</span>
        <span>{friendlyTime(today.dayEnd)}</span>
      </div>
    </div>
  );
}
