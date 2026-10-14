import { useCallback, useEffect, useRef, useState } from 'react';
import type { AtlasChangeView, ChatLineView } from '@shared/atlas-modes';
import { errorMessage, useLive } from '@/hooks/useLive';
import { ErrorNote, buttonPrimary, buttonQuiet, inputClass } from '@/components/ui';

interface Props {
  onClose(): void;
  onSettings(): void;
  onBrainDump(): void;
  onPlan(): void;
}

/** The Atlas drawer: chat, the day's Atlas changes with Undo, and the modes. */
export function AtlasPanel({ onClose, onSettings, onBrainDump, onPlan }: Props) {
  const [lines, setLines] = useState<ChatLineView[]>([]);
  const [draft, setDraft] = useState('');
  const [sending, setSending] = useState(false);
  const [streaming, setStreaming] = useState('');
  const [error, setError] = useState<{ text: string; setup: boolean } | null>(null);
  const end = useRef<HTMLDivElement>(null);

  const loadStatus = useCallback(() => window.cortex.atlas.status(), []);
  const loadChanges = useCallback(() => window.cortex.atlas.changes(), []);
  const { data: status } = useLive(loadStatus);
  const { data: changes } = useLive(loadChanges);

  useEffect(() => {
    void window.cortex.atlas.history().then(setLines);
    return window.cortex.atlas.onChunk((piece) => setStreaming((s) => s + piece));
  }, []);
  useEffect(() => {
    end.current?.scrollIntoView?.({ block: 'end' });
  }, [lines, streaming]);

  const send = () => {
    const text = draft.trim();
    if (!text || sending) return;
    setDraft('');
    setError(null);
    setStreaming('');
    setSending(true);
    setLines((l) => [...l, { role: 'user', text }]);
    window.cortex.atlas
      .send(text)
      .then(async (result) => {
        if (!result.ok) {
          setError({
            text: result.error,
            setup: result.kind === 'no-key' || result.kind === 'bad-key',
          });
          setLines((l) => l.slice(0, -1));
          setDraft(text);
          return;
        }
        setLines(await window.cortex.atlas.history());
      })
      .catch((e: unknown) => setError({ text: errorMessage(e), setup: false }))
      .finally(() => {
        setSending(false);
        setStreaming('');
      });
  };

  const undo = (change: AtlasChangeView) => {
    window.cortex.undo
      .apply(change.id)
      .catch((e: unknown) => setError({ text: errorMessage(e), setup: false }));
  };

  const noKey = status !== null && !status.hasKey;

  return (
    <aside
      aria-label="Atlas"
      className="flex h-full w-[26rem] shrink-0 flex-col border-l border-line bg-surface"
    >
      <header className="flex items-center justify-between border-b border-line px-4 py-3">
        <h2 className="text-lg font-semibold">Atlas</h2>
        <button className={buttonQuiet} onClick={onClose} aria-label="Close Atlas">
          Close
        </button>
      </header>

      <div className="flex gap-2 border-b border-line px-4 py-2">
        <button className={buttonQuiet} onClick={onPlan} disabled={noKey}>
          Plan the rest of today
        </button>
        <button className={buttonQuiet} onClick={onBrainDump} disabled={noKey}>
          Brain dump
        </button>
      </div>

      <div className="flex-1 space-y-3 overflow-y-auto px-4 py-3" data-testid="atlas-transcript">
        {noKey && (
          <div className="rounded-card border border-dashed border-line p-4 text-sm">
            <p className="font-medium">Atlas needs your Anthropic API key.</p>
            <p className="mt-1 text-ink-muted">
              Add it once in Settings. Everything else in Cortex works without it.
            </p>
            <button className={`${buttonQuiet} mt-3`} onClick={onSettings}>
              Open Settings
            </button>
          </div>
        )}
        {!noKey && lines.length === 0 && !sending && (
          <p className="text-sm text-ink-muted">
            Ask for what you need: &ldquo;Add grade lab reports to Chemistry for Friday&rdquo;, or
            &ldquo;What&rsquo;s on for today?&rdquo;
          </p>
        )}
        {lines.map((line, i) => (
          <p
            key={i}
            data-role={line.role}
            className={`whitespace-pre-wrap rounded-lg px-3 py-2 text-sm ${
              line.role === 'user' ? 'ml-8 bg-raised' : 'mr-8 border border-line'
            }`}
          >
            {line.text}
          </p>
        ))}
        {sending && (
          <p
            data-role="assistant"
            className="mr-8 whitespace-pre-wrap rounded-lg border border-line px-3 py-2 text-sm"
          >
            {streaming || 'Thinking…'}
          </p>
        )}
        <div ref={end} />
      </div>

      {error && (
        <div className="px-4">
          <ErrorNote message={error.text} />
          {error.setup && (
            <button className={`${buttonQuiet} mb-3`} onClick={onSettings}>
              Open Settings
            </button>
          )}
        </div>
      )}

      {changes && changes.length > 0 && (
        <details className="border-t border-line px-4 py-2 text-sm" open>
          <summary className="cursor-pointer font-medium">
            Atlas changed today ({changes.filter((c) => !c.undone).length})
          </summary>
          <ul className="mt-2 max-h-40 space-y-1 overflow-y-auto" data-testid="atlas-changes">
            {changes.map((c) => (
              <li key={c.id} className="flex items-center justify-between gap-2">
                <span className={c.undone ? 'text-ink-muted line-through' : ''}>{c.summary}</span>
                {!c.undone && (
                  <button
                    className="shrink-0 text-accent-soft hover:underline"
                    aria-label={`Undo ${c.summary}`}
                    onClick={() => undo(c)}
                  >
                    Undo
                  </button>
                )}
              </li>
            ))}
          </ul>
        </details>
      )}

      <form
        className="flex gap-2 border-t border-line p-3"
        onSubmit={(e) => {
          e.preventDefault();
          send();
        }}
      >
        <textarea
          aria-label="Message Atlas"
          rows={2}
          className={`${inputClass} resize-none`}
          placeholder={noKey ? 'Add your API key in Settings first' : 'Message Atlas'}
          value={draft}
          disabled={noKey}
          onChange={(e) => setDraft(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter' && !e.shiftKey) {
              e.preventDefault();
              send();
            }
          }}
        />
        <button
          type="submit"
          className={buttonPrimary}
          disabled={sending || noKey || !draft.trim()}
        >
          Send
        </button>
      </form>
    </aside>
  );
}
