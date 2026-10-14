import { useEffect, useState } from 'react';
import type { ApplyOutcome, SortProposal } from '@shared/atlas-modes';
import type { Area } from '@shared/core';
import { errorMessage } from '@/hooks/useLive';
import { ErrorNote, Loading, buttonPrimary, buttonQuiet, inputClass } from '@/components/ui';
import { AppliedNote, AreaSelect, Modal, unwrap } from './shared';

interface Row extends SortProposal {
  on: boolean;
}

/** Inbox → Sort with Atlas. Atlas proposes; nothing changes until the user presses Apply. */
export function SortDialog({ areas, onClose }: { areas: Area[]; onClose(): void }) {
  const [rows, setRows] = useState<Row[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [applied, setApplied] = useState<ApplyOutcome | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    let cancelled = false;
    window.cortex.atlas.sort().then(
      (r) => {
        if (cancelled) return;
        try {
          setRows(unwrap(r).proposals.map((p) => ({ ...p, on: p.areaId !== null })));
        } catch (e) {
          setError(errorMessage(e));
        }
      },
      (e: unknown) => !cancelled && setError(errorMessage(e)),
    );
    return () => {
      cancelled = true;
    };
  }, []);

  const patch = (id: string, change: Partial<Row>) =>
    setRows((rs) => rs?.map((r) => (r.taskId === id ? { ...r, ...change } : r)) ?? null);
  const chosen = rows?.filter((r) => r.on) ?? [];

  const apply = () => {
    setBusy(true);
    setError(null);
    window.cortex.atlas
      .applySort({
        items: chosen.map((r) => ({
          taskId: r.taskId,
          areaId: r.areaId,
          dueDate: r.dueDate,
          size: r.size,
        })),
      })
      .then((r) => setApplied(unwrap(r)))
      .catch((e: unknown) => setError(errorMessage(e)))
      .finally(() => setBusy(false));
  };

  return (
    <Modal title="Sort with Atlas" onClose={onClose} wide>
      <ErrorNote message={error} />
      {applied ? (
        <AppliedNote outcome={applied} onUndone={onClose} onClose={onClose} />
      ) : !rows ? (
        error ? null : (
          <Loading label="Atlas is sorting" />
        )
      ) : rows.length === 0 ? (
        <p className="text-ink-muted">The inbox is empty. Nothing to sort.</p>
      ) : (
        <>
          <p className="mb-3 text-sm text-ink-muted">
            These are Atlas&apos;s suggestions. Nothing changes until you press Apply. Untick or
            edit anything.
          </p>
          <ul className="divide-y divide-line" data-testid="sort-proposals">
            {rows.map((r) => (
              <li key={r.taskId} className="flex flex-wrap items-center gap-3 py-2">
                <input
                  type="checkbox"
                  aria-label={`Apply to ${r.title}`}
                  checked={r.on}
                  onChange={(e) => patch(r.taskId, { on: e.target.checked })}
                />
                <span className="min-w-0 flex-1">
                  <span className="block truncate font-medium">{r.title}</span>
                  <span className="text-xs text-ink-muted">{r.reason}</span>
                </span>
                <AreaSelect
                  areas={areas}
                  label={`Area for ${r.title}`}
                  value={r.areaId}
                  onChange={(areaId) =>
                    patch(r.taskId, {
                      areaId,
                      areaName: areas.find((a) => a.id === areaId)?.name ?? null,
                      on: areaId !== null,
                    })
                  }
                />
                <input
                  type="date"
                  aria-label={`Due date for ${r.title}`}
                  className={`${inputClass} !w-auto`}
                  value={r.dueDate ?? ''}
                  onChange={(e) => patch(r.taskId, { dueDate: e.target.value || null })}
                />
              </li>
            ))}
          </ul>
          <div className="mt-4 flex justify-end gap-2">
            <button className={buttonQuiet} onClick={onClose}>
              Cancel
            </button>
            <button
              className={buttonPrimary}
              disabled={busy || chosen.length === 0}
              onClick={apply}
            >
              Apply {chosen.length}
            </button>
          </div>
        </>
      )}
    </Modal>
  );
}
