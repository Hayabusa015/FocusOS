import { useEffect, useState } from 'react';
import type { UpdaterState } from '@shared/schemas';

/** The live update state from the main process. Null until the first reply arrives. */
export function useUpdaterState(): UpdaterState | null {
  const [state, setState] = useState<UpdaterState | null>(null);
  useEffect(() => {
    let alive = true;
    void window.cortex.updater.getState().then((s) => alive && setState(s));
    const unsubscribe = window.cortex.updater.onState((s) => alive && setState(s));
    return () => {
      alive = false;
      unsubscribe();
    };
  }, []);
  return state;
}

/** True while an update is snoozed ("Later"), re-rendering when the snooze runs out. */
export function useIsSnoozed(snoozedUntil: string | null): boolean {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    if (!snoozedUntil) return;
    const remaining = Date.parse(snoozedUntil) - Date.now();
    if (remaining <= 0) return;
    // Wake just after the snooze ends so the banner comes back on its own.
    const id = setTimeout(() => setNow(Date.now()), Math.min(remaining + 50, 2 ** 31 - 1));
    return () => clearTimeout(id);
  }, [snoozedUntil]);
  return snoozedUntil !== null && Date.parse(snoozedUntil) > now;
}
