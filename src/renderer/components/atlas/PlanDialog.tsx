import { useEffect, useState } from 'react';
import type { ApplyOutcome, PlanBlock, PlanResult } from '@shared/atlas-modes';
import { errorMessage } from '@/hooks/useLive';
import { ErrorNote, Loading, buttonPrimary, buttonQuiet } from '@/components/ui';
import { AppliedNote, Modal, unwrap } from './shared';

/** Today → Plan the rest of today. Atlas proposes a schedule; the user accepts all, some or none. */
export function PlanDialog({ onClose }: { onClose(): void }) {
  const [plan, setPlan] = useState<PlanResult | null>(null);
  const [off, setOff] = useState<Set<string>>(new Set());
  const [error, setError] = useState<string | null>(null);
  const [applied, setApplied] = useState<ApplyOutcome | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    let cancelled = false;
    window.cortex.atlas.plan().then(
      (r) => {
        if (cancelled) return;
        try {
          setPlan(unwrap(r));
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

  const chosen: PlanBlock[] = plan?.blocks.filter((b) => !off.has(b.taskId)) ?? [];
  const end = (b: PlanBlock) => {
    const total = Number(b.time.slice(0, 2)) * 60 + Number(b.time.slice(3)) + b.minutes;
    return `${String(Math.floor(total / 60)).padStart(2, '0')}:${String(total % 60).padStart(2, '0')}`;
  };

  const apply = () => {
    setBusy(true);
    setError(null);
    window.cortex.atlas
      .applyPlan({
        blocks: chosen.map(({ taskId, time, minutes }) => ({ taskId, time, minutes })),
      })
      .then((r) => setApplied(unwrap(r)))
      .catch((e: unknown) => setError(errorMessage(e)))
      .finally(() => setBusy(false));
  };

  return (
    <Modal title="Plan the rest of today" onClose={onClose}>
      <ErrorNote message={error} />
      {applied ? (
        <AppliedNote outcome={applied} onUndone={onClose} onClose={onClose} />
      ) : !plan ? (
        error ? null : (
          <Loading label="Atlas is planning" />
        )
      ) : (
        <>
          <p className="mb-1 text-sm text-ink-muted" data-testid="plan-summary">
            {plan.freeMinutes} free minutes left today. Atlas plans {plan.plannedMinutes} and keeps
            the rest open.
          </p>
          {plan.note && <p className="mb-3 text-sm">{plan.note}</p>}
          {plan.blocks.length === 0 ? (
            <p className="text-ink-muted">Nothing to schedule. The rest of the day is yours.</p>
          ) : (
            <ul className="divide-y divide-line" data-testid="plan-blocks">
              {plan.blocks.map((b) => (
                <li key={b.taskId} className="flex items-center gap-3 py-2">
                  <input
                    type="checkbox"
                    aria-label={`Schedule ${b.title}`}
                    checked={!off.has(b.taskId)}
                    onChange={(e) =>
                      setOff((prev) => {
                        const next = new Set(prev);
                        if (e.target.checked) next.delete(b.taskId);
                        else next.add(b.taskId);
                        return next;
                      })
                    }
                  />
                  <span className="w-28 shrink-0 text-sm tabular-nums text-ink-muted">
                    {b.time}–{end(b)}
                  </span>
                  <span className="min-w-0 flex-1 truncate font-medium">{b.title}</span>
                  <span className="text-xs text-ink-muted">{b.minutes} min</span>
                </li>
              ))}
            </ul>
          )}
          {plan.dropped.length > 0 && (
            <details className="mt-3 text-sm text-ink-muted">
              <summary className="cursor-pointer">Left out ({plan.dropped.length})</summary>
              <ul className="mt-1 space-y-1">
                {plan.dropped.map((d, i) => (
                  <li key={`${d.taskId}-${i}`}>
                    {d.title}: {d.reason}
                  </li>
                ))}
              </ul>
            </details>
          )}
          <div className="mt-4 flex justify-end gap-2">
            <button className={buttonQuiet} onClick={onClose}>
              None of it
            </button>
            <button
              className={buttonPrimary}
              disabled={busy || chosen.length === 0}
              onClick={apply}
            >
              Schedule {chosen.length}
            </button>
          </div>
        </>
      )}
    </Modal>
  );
}
