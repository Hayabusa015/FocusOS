/**
 * A tiny relay for "the voice hotkey was pressed". The hotkey opens the Atlas panel, but the panel
 * may not exist yet, so a request that arrives first is held until the panel asks for it.
 */
type Listener = () => void;
let listener: Listener | null = null;
let pending = false;

export const voiceBus = {
  /** The hotkey was pressed. */
  request(): void {
    if (listener) listener();
    else pending = true;
  },
  /** The panel is ready. Returns an unsubscribe. Any request that came first is delivered now. */
  listen(fn: Listener): () => void {
    listener = fn;
    if (pending) {
      pending = false;
      queueMicrotask(fn);
    }
    return () => {
      if (listener === fn) listener = null;
    };
  },
};
