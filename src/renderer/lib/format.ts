/** "Today at 3:42 PM", "Oct 14, 3:42 PM", or "Never". */
export function formatWhen(iso: string | null, now: Date = new Date()): string {
  if (!iso) return 'Never';
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return 'Never';
  const time = date.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' });
  if (date.toDateString() === now.toDateString()) return `Today at ${time}`;
  const day = date.toLocaleDateString([], { month: 'short', day: 'numeric' });
  return `${day}, ${time}`;
}

export function greeting(now: Date = new Date()): string {
  const hour = now.getHours();
  if (hour < 5) return 'Still up';
  if (hour < 12) return 'Good morning';
  if (hour < 18) return 'Good afternoon';
  return 'Good evening';
}

export interface DaySummary {
  phase: 'before' | 'during' | 'after';
  /** Open tasks due today, with their sizes. */
  dueToday: { title: string; size: 's' | 'm' | 'l' }[];
  doneToday: number;
  carriedForward: number;
}

/**
 * One dry sentence about the day, in Atlas's register: calm, exact, never gushing, never guilty.
 * It is worked out from the numbers, so it costs nothing and works with no key.
 */
export function dryLine(day: DaySummary): string {
  const left = day.dueToday.length;
  const carried =
    day.carriedForward > 0 ? ` ${day.carriedForward} still on deck from earlier.` : '';
  if (left === 0) {
    if (day.doneToday === 0)
      return `A clear page. Add the first thing, or leave it clear.${carried}`;
    if (day.phase === 'after') return `That is the day. Anything left can wait.${carried}`;
    return `Everything dated today is done.${carried}`;
  }
  const big = day.dueToday.find((t) => t.size === 'l');
  if (left === 1) return `One thing left: ${day.dueToday[0]?.title ?? 'it'}.${carried}`;
  const shape = big ? `${big.title} is the big one.` : 'None of them is large.';
  return `${left} left today. ${shape}${carried}`;
}
