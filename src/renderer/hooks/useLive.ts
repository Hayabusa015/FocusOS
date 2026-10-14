import { useEffect, useState } from 'react';

export function errorMessage(error: unknown): string {
  const raw = error instanceof Error ? error.message : String(error);
  // Electron wraps handler errors as "Error invoking remote method '...': Error: <message>".
  return raw.replace(/^Error invoking remote method '[^']*': (Error: )?/, '');
}

/**
 * Loads data and loads it again whenever anything changes (a task saved in another window, a
 * change by Atlas, an undo). `load` must be stable (wrap it in useCallback). `refreshMs` also
 * reloads on a timer, for pages that show the clock.
 */
export function useLive<T>(load: () => Promise<T>, refreshMs?: number) {
  const [data, setData] = useState<T | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    const run = () => {
      load().then(
        (value) => {
          if (cancelled) return;
          setData(value);
          setError(null);
        },
        (e: unknown) => {
          if (!cancelled) setError(errorMessage(e));
        },
      );
    };
    run();
    const off = window.cortex.onDataChanged(run);
    const timer = refreshMs ? setInterval(run, refreshMs) : undefined;
    return () => {
      cancelled = true;
      off();
      if (timer) clearInterval(timer);
    };
  }, [load, refreshMs]);

  return { data, error };
}
