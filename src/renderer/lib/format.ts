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
