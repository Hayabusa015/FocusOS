import { useCallback, useState } from 'react';
import type { MaintenanceItem, MaintenanceTemplate } from '@shared/core';
import { Card, Empty, ErrorNote, buttonPrimary, buttonQuiet, inputClass } from '@/components/ui';
import { errorMessage, useLive } from '@/hooks/useLive';

const STATE_TEXT: Record<MaintenanceItem['state'], string> = {
  unknown: 'Not logged yet',
  overdue: 'Was due',
  'due-soon': 'Coming up',
  ok: 'All good',
};

function ItemCard({ item, onError }: { item: MaintenanceItem; onError(message: string): void }) {
  const run = (action: () => Promise<unknown>) =>
    action().catch((e: unknown) => onError(errorMessage(e)));
  return (
    <Card className="flex items-center justify-between gap-4" label={item.name}>
      <div className="min-w-0">
        <p className="font-medium">{item.name}</p>
        <p className="mt-0.5 text-sm text-ink-muted">{item.statusText}</p>
        <p
          className={`mt-1 text-xs ${item.state === 'overdue' ? 'text-caution' : item.state === 'due-soon' ? 'text-accent-soft' : 'text-ink-muted'}`}
        >
          {STATE_TEXT[item.state]} · every {item.intervalDays} days
        </p>
      </div>
      <div className="flex shrink-0 items-center gap-2">
        <button
          className={buttonQuiet}
          aria-label={`Remove ${item.name}`}
          onClick={() => void run(() => window.cortex.maintenance.delete(item.id))}
        >
          Remove
        </button>
        <button
          className={`${buttonPrimary} px-5 py-2.5 text-base`}
          onClick={() => void run(() => window.cortex.maintenance.done(item.id))}
        >
          Done
        </button>
      </div>
    </Card>
  );
}

export function MaintenancePage() {
  const load = useCallback(() => window.cortex.maintenance.list(), []);
  const loadTemplates = useCallback(() => window.cortex.maintenance.templates(), []);
  const { data: items, error } = useLive(load);
  const { data: templates } = useLive(loadTemplates);
  const [actionError, setActionError] = useState<string | null>(null);
  const [name, setName] = useState('');
  const [intervalDays, setIntervalDays] = useState(90);
  const [lastDone, setLastDone] = useState('');

  const add = (input: {
    name: string;
    intervalDays: number;
    lastDone?: string | null;
    notes?: string;
  }) => {
    setActionError(null);
    window.cortex.maintenance.create(input).catch((e: unknown) => setActionError(errorMessage(e)));
  };
  const unused = (templates ?? []).filter(
    (t: MaintenanceTemplate) => !(items ?? []).some((i) => i.name === t.name),
  );

  return (
    <div>
      <header className="mb-6">
        <h1 className="text-4xl font-bold tracking-tight">Home maintenance</h1>
        <p className="mt-1 text-ink-muted">
          Things that need doing every so often. Press Done when you do one and the clock restarts.
        </p>
      </header>
      <ErrorNote message={error ?? actionError} />

      <div className="mb-8 space-y-3">
        {items && items.length === 0 && (
          <Empty title="Nothing tracked yet">
            Pick a starting point below, or add your own. When you last did it is optional.
          </Empty>
        )}
        {(items ?? []).map((item) => (
          <ItemCard key={item.id} item={item} onError={setActionError} />
        ))}
      </div>

      {unused.length > 0 && (
        <section aria-label="Starting points" className="mb-8">
          <h2 className="mb-2 text-sm font-semibold uppercase tracking-wide text-ink-muted">
            Starting points
          </h2>
          <div className="flex flex-wrap gap-2">
            {unused.map((t) => (
              <button
                key={t.key}
                className={buttonQuiet}
                onClick={() =>
                  add({ name: t.name, intervalDays: t.intervalDays, notes: t.notes || undefined })
                }
              >
                + {t.name}
              </button>
            ))}
          </div>
        </section>
      )}

      <Card label="Add your own">
        <h2 className="mb-3 text-sm font-semibold uppercase tracking-wide text-ink-muted">
          Add your own
        </h2>
        <form
          className="grid gap-3 sm:grid-cols-[1fr_8rem_10rem_auto] sm:items-end"
          onSubmit={(e) => {
            e.preventDefault();
            if (!name.trim()) return;
            add({ name, intervalDays, lastDone: lastDone || null });
            setName('');
            setLastDone('');
          }}
        >
          <label className="text-sm">
            <span className="mb-1 block text-ink-muted">What</span>
            <input className={inputClass} value={name} onChange={(e) => setName(e.target.value)} />
          </label>
          <label className="text-sm">
            <span className="mb-1 block text-ink-muted">Every (days)</span>
            <input
              type="number"
              min={1}
              className={inputClass}
              value={intervalDays}
              onChange={(e) => setIntervalDays(Number(e.target.value) || 1)}
            />
          </label>
          <label className="text-sm">
            <span className="mb-1 block text-ink-muted">Last done</span>
            <input
              type="date"
              className={inputClass}
              value={lastDone}
              onChange={(e) => setLastDone(e.target.value)}
            />
          </label>
          <button className={buttonPrimary} disabled={!name.trim()}>
            Add
          </button>
        </form>
      </Card>
    </div>
  );
}
