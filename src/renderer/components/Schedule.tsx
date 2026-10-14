import type { Area, TodayView } from '@shared/core';
import { areaColor, indexAreas } from '@/lib/areas';
import { minutesText, timeOfIso } from '@/lib/dates';

/**
 * Today's time blocks in order, each tinted with its area's colour. The block you are in is
 * outlined, and a line with the time marks where now falls between the others.
 */
export function Schedule({
  today,
  areas,
  openTask,
}: {
  today: TodayView;
  areas: Area[];
  openTask(id: string): void;
}) {
  const byId = indexAreas(areas);
  const now = new Date(today.nowIso).getTime();
  const nowId = today.nowBlock?.taskId ?? null;

  // Where the now-line goes: before the first block that has not started yet, unless you are in one.
  const lineBefore = nowId ? -1 : today.blocks.findIndex((b) => new Date(b.start).getTime() > now);
  const lineAtEnd = !nowId && lineBefore === -1 && today.blocks.length > 0;

  const nowLine = (
    <li
      key="now-line"
      aria-label="Now"
      className="flex items-center gap-3 py-1"
      data-testid="now-line"
    >
      <span className="w-16 shrink-0 text-right">
        <span className="rounded-full bg-brand-violet px-2 py-0.5 text-xs font-semibold tabular-nums text-ink">
          {timeOfIso(today.nowIso)}
        </span>
      </span>
      <span className="h-px flex-1 bg-brand-violet" />
    </li>
  );

  return (
    <ol className="space-y-1.5" data-testid="schedule">
      {today.blocks.map((b, i) => {
        const area = b.areaId ? byId.get(b.areaId) : null;
        const color = areaColor(area);
        const done = b.status === 'done';
        const current = b.taskId === nowId;
        const minutes = Math.round(
          (new Date(b.end).getTime() - new Date(b.start).getTime()) / 60_000,
        );
        return (
          <li key={b.taskId} className="contents">
            {lineBefore === i && nowLine}
            <div className="flex items-stretch gap-3">
              <span className="w-16 shrink-0 pt-2.5 text-right text-xs tabular-nums text-ink-muted">
                {timeOfIso(b.start)}
              </span>
              <button
                onClick={() => openTask(b.taskId)}
                aria-current={current ? 'time' : undefined}
                className={`flex min-w-0 flex-1 items-center gap-3 rounded-md border-l-[3px] px-3 py-2 text-left transition-colors hover:brightness-125 ${
                  current ? 'outline outline-2 -outline-offset-2 outline-brand-violet' : ''
                }`}
                style={{
                  borderLeftColor: color,
                  background: `color-mix(in srgb, ${color} ${done ? 6 : 14}%, transparent)`,
                }}
              >
                <span
                  aria-hidden
                  className={`grid size-5 shrink-0 place-items-center rounded-full text-xs ${
                    done ? 'bg-win text-accent-ink' : 'border border-ink-muted'
                  }`}
                >
                  {done ? '✓' : ''}
                </span>
                <span
                  className={`min-w-0 flex-1 truncate text-sm ${done ? 'text-ink-muted line-through' : 'font-medium'}`}
                >
                  {b.title}
                </span>
                <span className="shrink-0 text-xs text-ink-muted">
                  {minutesText(minutes)}
                  {area ? ` · ${area.name}` : ''}
                </span>
              </button>
            </div>
          </li>
        );
      })}
      {lineAtEnd && nowLine}
    </ol>
  );
}
