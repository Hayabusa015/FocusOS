import { useState } from 'react';
import type { ApplyOutcome, DraftTask } from '@shared/atlas-modes';
import type { Area } from '@shared/core';
import { errorMessage } from '@/hooks/useLive';
import { ErrorNote, Loading, buttonPrimary, buttonQuiet, inputClass } from '@/components/ui';
import { AppliedNote, AreaSelect, Modal, unwrap } from './shared';

interface Row extends DraftTask {
  key: number;
  on: boolean;
}

/**
 * Brain dump: ramble, and Atlas turns it into a checklist. Everything is pre-ticked and editable;
 * nothing is saved until the user presses Add.
 */
export function BrainDumpDialog({ areas, onClose }: { areas: Area[]; onClose(): void }) {
  const [text, setText] = useState('');
  const [loading, setLoading] = useState(false);
  const [rows, setRows] = useState<Row[] | null>(null);
  const [unparsed, setUnparsed] = useState<string[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [applied, setApplied] = useState<ApplyOutcome | null>(null);
  const [busy, setBusy] = useState(false);

  const sortOut = () => {
    setLoading(true);
    setError(null);
    window.cortex.atlas
      .brainDump(text)
      .then((r) => {
        const result = unwrap(r);
        setRows(result.tasks.map((t, key) => ({ ...t, key, on: true })));
        setUnparsed(result.unparsed);
      })
      .catch((e: unknown) => setError(errorMessage(e)))
      .finally(() => setLoading(false));
  };

  const patch = (key: number, change: Partial<Row>) =>
    setRows((rs) => rs?.map((r) => (r.key === key ? { ...r, ...change } : r)) ?? null);
  const chosen = rows?.filter((r) => r.on && r.title.trim()) ?? [];

  const add = () => {
    setBusy(true);
    setError(null);
    window.cortex.atlas
      .applyBrainDump({
        tasks: chosen.map(({ key: _key, on: _on, ...task }) => ({
          ...task,
          title: task.title.trim(),
        })),
      })
      .then((r) => setApplied(unwrap(r)))
      .catch((e: unknown) => setError(errorMessage(e)))
      .finally(() => setBusy(false));
  };

  return (
    <Modal title="Brain dump" onClose={onClose} wide>
      <ErrorNote message={error} />
      {applied ? (
        <AppliedNote outcome={applied} onUndone={onClose} onClose={onClose} />
      ) : loading ? (
        <Loading label="Atlas is reading your dump" />
      ) : !rows ? (
        <>
          <label className="mb-2 block text-sm text-ink-muted" htmlFor="dump-text">
            Type or paste everything on your mind. Atlas will pull out the tasks.
          </label>
          <textarea
            id="dump-text"
            className={`${inputClass} h-48`}
            value={text}
            autoFocus
            onChange={(e) => setText(e.target.value)}
          />
          <div className="mt-4 flex justify-end gap-2">
            <button className={buttonQuiet} onClick={onClose}>
              Cancel
            </button>
            <button className={buttonPrimary} disabled={!text.trim()} onClick={sortOut}>
              Sort it out
            </button>
          </div>
        </>
      ) : (
        <>
          <p className="mb-3 text-sm text-ink-muted">
            Untick or edit anything. Nothing is saved until you press Add.
          </p>
          {rows.length === 0 && <p className="text-ink-muted">Atlas found no tasks in that.</p>}
          <ul className="divide-y divide-line" data-testid="dump-tasks">
            {rows.map((r) => (
              <li key={r.key} className="flex flex-wrap items-center gap-3 py-2">
                <input
                  type="checkbox"
                  aria-label={`Add ${r.title}`}
                  checked={r.on}
                  onChange={(e) => patch(r.key, { on: e.target.checked })}
                />
                <input
                  aria-label="Task title"
                  className={`${inputClass} min-w-48 flex-1`}
                  value={r.title}
                  onChange={(e) => patch(r.key, { title: e.target.value })}
                />
                <AreaSelect
                  areas={areas}
                  label={`Area for ${r.title}`}
                  value={r.areaId}
                  onChange={(areaId) => patch(r.key, { areaId })}
                />
                <input
                  type="date"
                  aria-label={`Due date for ${r.title}`}
                  className={`${inputClass} !w-auto`}
                  value={r.dueDate ?? ''}
                  onChange={(e) => patch(r.key, { dueDate: e.target.value || null })}
                />
              </li>
            ))}
          </ul>
          {unparsed.length > 0 && (
            <div className="mt-4 rounded-lg border border-line p-3 text-sm">
              <p className="mb-1 font-medium">Not tasks (left as they are)</p>
              <ul className="list-disc pl-5 text-ink-muted">
                {unparsed.map((u, i) => (
                  <li key={i}>{u}</li>
                ))}
              </ul>
            </div>
          )}
          <div className="mt-4 flex justify-end gap-2">
            <button className={buttonQuiet} onClick={() => setRows(null)}>
              Back
            </button>
            <button className={buttonPrimary} disabled={busy || chosen.length === 0} onClick={add}>
              Add {chosen.length}
            </button>
          </div>
        </>
      )}
    </Modal>
  );
}
