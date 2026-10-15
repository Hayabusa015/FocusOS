import { useCallback, useState } from 'react';
import type { Area, TaskSize } from '@shared/core';
import type { EmailSuggestionView } from '@shared/google';
import { errorMessage, useLive } from '@/hooks/useLive';
import { ErrorNote, SectionTitle, buttonPrimary, buttonQuiet, inputClass } from './ui';

interface Edit {
  title: string;
  dueDate: string;
  areaId: string;
  size: TaskSize | '';
}

const initial = (s: EmailSuggestionView): Edit => ({
  title: s.proposal.task?.title ?? s.subject,
  dueDate: s.proposal.task?.dueDate ?? '',
  areaId: s.proposal.task?.areaId ?? '',
  size: s.proposal.task?.size ?? '',
});

/**
 * Tasks Atlas suggests from new email (PLAN §9.4). Nothing here is a task until you press Accept;
 * Dismiss throws the suggestion away, and either way that message is never suggested again.
 * Only the sender, subject, date and Atlas's proposal are ever kept, never the message itself.
 */
export function EmailSuggestions({ areas }: { areas: Area[] }) {
  const load = useCallback(() => window.cortex.google.emailSuggestions(), []);
  const { data: suggestions } = useLive(load);
  const [edits, setEdits] = useState<Record<string, Edit>>({});
  const [problem, setProblem] = useState<string | null>(null);
  const [busy, setBusy] = useState<string | null>(null);

  if (!suggestions || suggestions.length === 0) return null;
  const editFor = (s: EmailSuggestionView): Edit => edits[s.id] ?? initial(s);
  const change = (s: EmailSuggestionView, patch: Partial<Edit>) =>
    setEdits((all) => ({ ...all, [s.id]: { ...editFor(s), ...patch } }));

  const accept = async (s: EmailSuggestionView) => {
    const e = editFor(s);
    setBusy(s.id);
    setProblem(null);
    try {
      const result = await window.cortex.google.acceptEmail({
        id: s.id,
        title: e.title,
        dueDate: e.dueDate || null,
        areaId: e.areaId || null,
        ...(e.size ? { size: e.size } : {}),
      });
      if (!result.ok) setProblem(result.error);
    } catch (error) {
      setProblem(errorMessage(error));
    } finally {
      setBusy(null);
    }
  };
  const dismiss = (s: EmailSuggestionView) => {
    setProblem(null);
    window.cortex.google.dismissEmail(s.id).catch((e: unknown) => setProblem(errorMessage(e)));
  };

  return (
    <section aria-label="Email suggestions" className="mb-8" data-testid="email-suggestions">
      <SectionTitle hint="Atlas read the sender, subject and a snippet. Nothing is added until you accept.">
        Email suggestions
      </SectionTitle>
      <ErrorNote message={problem} />
      <ul className="space-y-3">
        {suggestions.map((s) => {
          const e = editFor(s);
          return (
            <li
              key={s.id}
              data-testid="email-suggestion"
              className="rounded-lg border border-line bg-surface p-4"
            >
              <p className="truncate text-xs text-ink-muted">
                {s.from} · {new Date(s.receivedAt).toLocaleDateString()}
              </p>
              <p className="mt-0.5 truncate text-sm font-medium">{s.subject}</p>
              <p className="mt-0.5 text-xs text-ink-muted">{s.proposal.reason}</p>
              <div className="mt-3 grid gap-2 sm:grid-cols-[1fr_auto_auto_auto]">
                <input
                  className={inputClass}
                  aria-label="Task title"
                  value={e.title}
                  onChange={(ev) => change(s, { title: ev.target.value })}
                />
                <select
                  className={inputClass}
                  aria-label="Area"
                  value={e.areaId}
                  onChange={(ev) => change(s, { areaId: ev.target.value })}
                >
                  <option value="">Inbox (no area)</option>
                  {areas.map((a) => (
                    <option key={a.id} value={a.id}>
                      {a.name}
                    </option>
                  ))}
                </select>
                <input
                  type="date"
                  className={inputClass}
                  aria-label="Due date"
                  value={e.dueDate}
                  onChange={(ev) => change(s, { dueDate: ev.target.value })}
                />
                <select
                  className={inputClass}
                  aria-label="Size"
                  value={e.size}
                  onChange={(ev) => change(s, { size: ev.target.value as TaskSize | '' })}
                >
                  <option value="">Size</option>
                  <option value="s">Small</option>
                  <option value="m">Medium</option>
                  <option value="l">Large</option>
                </select>
              </div>
              <div className="mt-3 flex justify-end gap-2">
                <button className={buttonQuiet} onClick={() => dismiss(s)}>
                  Dismiss
                </button>
                <button
                  className={buttonPrimary}
                  disabled={busy === s.id || !e.title.trim()}
                  onClick={() => void accept(s)}
                >
                  Accept
                </button>
              </div>
            </li>
          );
        })}
      </ul>
    </section>
  );
}
