import { greeting } from '@/lib/format';

export function TodayPage() {
  const now = new Date();
  const date = now.toLocaleDateString([], { weekday: 'long', month: 'long', day: 'numeric' });
  return (
    <div>
      <header className="mb-8">
        <h1 className="text-3xl font-semibold tracking-tight">{greeting(now)}</h1>
        <p className="mt-1 text-ink-muted">{date}</p>
      </header>
      <section
        aria-label="Today"
        className="rounded-card border border-line bg-surface p-10 text-center"
      >
        <p className="text-lg font-medium">Nothing here yet</p>
        <p className="mx-auto mt-2 max-w-md text-sm text-ink-muted">
          This is the foundation. Capturing tasks, the Now and Next bar and your timeline arrive in
          the next build.
        </p>
      </section>
    </div>
  );
}
