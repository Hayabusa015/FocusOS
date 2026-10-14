import { useEffect, useState } from 'react';
import { errorMessage } from '@/hooks/useLive';

const SHOW_FOR_MS = 8000;

/**
 * After any change, offers Undo for a few seconds. Ctrl+Z undoes the latest change any time the
 * cursor is not in a text box.
 */
export function UndoToast() {
  const [toast, setToast] = useState<{ logId: string | null; text: string } | null>(null);

  useEffect(
    () =>
      window.cortex.onDataChanged((change) => {
        if (change.summary) setToast({ logId: change.logId, text: change.summary });
      }),
    [],
  );
  useEffect(() => {
    if (!toast) return;
    const timer = setTimeout(() => setToast(null), SHOW_FOR_MS);
    return () => clearTimeout(timer);
  }, [toast]);

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (!(event.ctrlKey || event.metaKey) || event.key.toLowerCase() !== 'z' || event.shiftKey)
        return;
      const target = event.target;
      if (
        target instanceof HTMLElement &&
        (target.tagName === 'INPUT' || target.tagName === 'TEXTAREA' || target.tagName === 'SELECT')
      ) {
        return; // Let a text box use its own undo.
      }
      event.preventDefault();
      void (async () => {
        try {
          const latest = (await window.cortex.undo.list()).find((entry) => !entry.undone);
          if (latest) await window.cortex.undo.apply(latest.id);
        } catch (e) {
          setToast({ logId: null, text: errorMessage(e) });
        }
      })();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);

  if (!toast) return null;
  const logId = toast.logId;
  return (
    <div
      role="status"
      className="fixed bottom-6 left-1/2 z-50 flex -translate-x-1/2 items-center gap-4 rounded-card border border-line bg-raised px-4 py-3 text-sm shadow-lg"
    >
      <span data-testid="toast-text">{toast.text}</span>
      {logId && (
        <button
          className="font-medium text-accent-soft hover:underline"
          onClick={() => {
            setToast(null);
            window.cortex.undo
              .apply(logId)
              .catch((e: unknown) => setToast({ logId: null, text: errorMessage(e) }));
          }}
        >
          Undo
        </button>
      )}
    </div>
  );
}
