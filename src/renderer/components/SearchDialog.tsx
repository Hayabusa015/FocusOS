import { useEffect, useRef, useState } from 'react';
import type { SearchResults } from '@shared/core';
import { errorMessage } from '@/hooks/useLive';
import { inputClass } from './ui';

interface Props {
  onClose(): void;
  onOpenTask(id: string): void;
  onOpenMaintenance(): void;
}

/** Ctrl+K: find a task or a maintenance item by what it says. */
export function SearchDialog({ onClose, onOpenTask, onOpenMaintenance }: Props) {
  const [query, setQuery] = useState('');
  const [results, setResults] = useState<SearchResults | null>(null);
  const [error, setError] = useState<string | null>(null);
  const input = useRef<HTMLInputElement>(null);

  useEffect(() => input.current?.focus(), []);
  useEffect(() => {
    const q = query.trim();
    if (!q) return;
    let cancelled = false;
    const timer = setTimeout(() => {
      window.cortex.search.run(q).then(
        (r) => {
          if (cancelled) return;
          setResults(r);
          setError(null);
        },
        (e: unknown) => {
          if (!cancelled) setError(errorMessage(e));
        },
      );
    }, 120);
    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [query]);

  const shown = query.trim() ? results : null;
  return (
    <div
      className="fixed inset-0 z-50 flex items-start justify-center bg-brand-black/40 pt-[15vh]"
      onMouseDown={(e) => e.target === e.currentTarget && onClose()}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-label="Search"
        className="w-full max-w-xl rounded-card border border-line bg-surface p-4"
        onKeyDown={(e) => e.key === 'Escape' && onClose()}
      >
        <input
          ref={input}
          className={inputClass}
          aria-label="Search tasks and maintenance"
          placeholder="Search tasks and maintenance"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
        />
        {error && <p className="mt-2 text-sm text-caution">{error}</p>}
        {shown && (
          <ul className="mt-3 max-h-80 overflow-y-auto" aria-label="Results">
            {shown.tasks.map((t) => (
              <li key={t.id}>
                <button
                  className="w-full rounded-lg px-3 py-2 text-left text-sm hover:bg-raised"
                  onClick={() => {
                    onOpenTask(t.id);
                    onClose();
                  }}
                >
                  {t.title}
                  {t.status === 'done' && <span className="ml-2 text-xs text-ink-muted">done</span>}
                </button>
              </li>
            ))}
            {shown.maintenance.map((m) => (
              <li key={m.id}>
                <button
                  className="w-full rounded-lg px-3 py-2 text-left text-sm hover:bg-raised"
                  onClick={() => {
                    onOpenMaintenance();
                    onClose();
                  }}
                >
                  🛠 {m.name}
                  <span className="ml-2 text-xs text-ink-muted">{m.statusText}</span>
                </button>
              </li>
            ))}
            {shown.tasks.length + shown.maintenance.length === 0 && (
              <li className="px-3 py-2 text-sm text-ink-muted">Nothing matches.</li>
            )}
          </ul>
        )}
      </div>
    </div>
  );
}
