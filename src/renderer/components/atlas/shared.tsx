import { useEffect } from 'react';
import type { ReactNode } from 'react';
import type { ApplyOutcome, AtlasOutcome } from '@shared/atlas-modes';
import type { Area } from '@shared/core';
import { buttonQuiet, inputClass } from '@/components/ui';

/** A centred dialog. Esc closes it. */
export function Modal({
  title,
  onClose,
  children,
  wide = false,
}: {
  title: string;
  onClose(): void;
  children: ReactNode;
  wide?: boolean;
}) {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);
  return (
    <div
      className="fixed inset-0 z-40 flex items-start justify-center overflow-y-auto bg-black/50 p-6"
      onMouseDown={(e) => e.target === e.currentTarget && onClose()}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-label={title}
        className={`my-8 w-full ${wide ? 'max-w-3xl' : 'max-w-xl'} rounded-card border border-line bg-surface p-6`}
      >
        <h2 className="mb-4 text-lg font-semibold">{title}</h2>
        {children}
      </div>
    </div>
  );
}

/** Unwraps an Atlas answer: the value, or a thrown sentence the dialog shows. */
export function unwrap<T>(result: AtlasOutcome<T>): T {
  if (!result.ok) throw new Error(result.error);
  return result.value;
}

/** Undoes a batch, newest first. */
export async function undoAll(logIds: string[]): Promise<void> {
  for (const id of [...logIds].reverse()) await window.cortex.undo.apply(id);
}

export function AreaSelect({
  areas,
  value,
  onChange,
  label,
}: {
  areas: Area[];
  value: string | null;
  onChange(next: string | null): void;
  label: string;
}) {
  return (
    <select
      aria-label={label}
      className={`${inputClass} !w-auto`}
      value={value ?? ''}
      onChange={(e) => onChange(e.target.value || null)}
    >
      <option value="">No area</option>
      {areas.map((a) => (
        <option key={a.id} value={a.id}>
          {a.name}
        </option>
      ))}
    </select>
  );
}

/** The "done" screen of a dialog: what changed, with Undo for the whole batch. */
export function AppliedNote({
  outcome,
  onUndone,
  onClose,
}: {
  outcome: ApplyOutcome;
  onUndone(): void;
  onClose(): void;
}) {
  return (
    <div>
      <p data-testid="atlas-applied" className="mb-2">
        {outcome.summary}.
      </p>
      {outcome.failed.length > 0 && (
        <p className="mb-2 text-sm text-caution">{outcome.failed.length} could not be changed.</p>
      )}
      <div className="mt-4 flex justify-end gap-2">
        {outcome.logIds.length > 0 && (
          <button
            className={buttonQuiet}
            onClick={() => {
              void undoAll(outcome.logIds).then(onUndone);
            }}
          >
            Undo all
          </button>
        )}
        <button className={buttonQuiet} onClick={onClose}>
          Close
        </button>
      </div>
    </div>
  );
}
