import { useCallback, useState } from 'react';
import {
  ATLAS_EFFORTS,
  ATLAS_MODELS,
  ATLAS_ROUTES,
  ROUTE_LABELS,
  resolveRoute,
} from '@shared/atlas';
import type { AtlasEffort, AtlasModel, AtlasRoute } from '@shared/atlas';
import { errorMessage, useLive } from '@/hooks/useLive';
import { Card, ErrorNote, buttonPrimary, buttonQuiet, inputClass } from '@/components/ui';

const MODEL_LABELS: Record<AtlasModel, string> = {
  'claude-opus-5-5': 'Opus 5.5',
  'claude-sonnet-5-5': 'Sonnet 5.5',
  'claude-haiku-5-5': 'Haiku 5.5',
};
const money = (n: number) => `$${n.toFixed(n < 1 ? 3 : 2)}`;

/** Settings → Atlas: the API key, the model and effort for each route, the cap, and the spend. */
export function AtlasSettings() {
  const loadStatus = useCallback(() => window.cortex.atlas.status(), []);
  const loadSettings = useCallback(() => window.cortex.settings.get(), []);
  const { data: status } = useLive(loadStatus);
  const { data: info } = useLive(loadSettings);
  const [key, setKey] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [capText, setCapText] = useState<string | null>(null);

  const run = (action: () => Promise<unknown>) => {
    setError(null);
    action().catch((e: unknown) => setError(errorMessage(e)));
  };
  const saveKey = () =>
    run(async () => {
      const result = await window.cortex.atlas.setKey(key);
      if (!result.ok) throw new Error(result.error);
      setKey('');
    });
  const setRoute = (route: AtlasRoute, change: { model?: AtlasModel; effort?: AtlasEffort }) => {
    const current = info?.settings.atlasRoutes ?? {};
    run(() =>
      window.cortex.settings.update({
        atlasRoutes: { ...current, [route]: { ...current[route], ...change } },
      }),
    );
  };
  const saveCap = () => {
    const text = (capText ?? '').trim();
    const value = text === '' ? null : Number(text);
    if (value !== null && (!Number.isFinite(value) || value < 0)) {
      setError('The cap must be a number of dollars, or empty for no cap.');
      return;
    }
    run(async () => {
      await window.cortex.settings.update({ atlasMonthlyCapUsd: value });
      setCapText(null);
    });
  };

  const overrides = info?.settings.atlasRoutes ?? {};
  const cap = info?.settings.atlasMonthlyCapUsd ?? null;

  return (
    <Card label="Atlas" className="mb-6">
      <h2 className="mb-2 text-lg font-semibold">Atlas</h2>
      <ErrorNote message={error} />

      <div className="border-b border-line pb-4">
        <p className="mb-2 text-sm">
          Anthropic API key:{' '}
          <strong data-testid="atlas-key-state">{status?.hasKey ? 'saved' : 'not set'}</strong>
        </p>
        {status && !status.canStoreKey && (
          <p className="mb-2 text-sm text-caution">
            This PC cannot protect a stored key, so Cortex will not save one.
          </p>
        )}
        <div className="flex gap-2">
          <input
            type="password"
            aria-label="Anthropic API key"
            autoComplete="off"
            placeholder="sk-ant-…"
            className={inputClass}
            value={key}
            onChange={(e) => setKey(e.target.value)}
          />
          <button className={buttonPrimary} disabled={!key.trim()} onClick={saveKey}>
            Save key
          </button>
          {status?.hasKey && (
            <button
              className={buttonQuiet}
              onClick={() => run(() => window.cortex.atlas.clearKey())}
            >
              Remove
            </button>
          )}
        </div>
        <p className="mt-2 text-xs text-ink-muted">
          Stored encrypted by Windows, in its own file. It is never sent anywhere except Anthropic.
        </p>
      </div>

      <div className="border-b border-line py-4">
        <p className="mb-2 text-sm font-medium">Model and effort for each job</p>
        <ul className="space-y-2">
          {ATLAS_ROUTES.map((route) => {
            const current = resolveRoute(route, overrides);
            return (
              <li key={route} className="flex items-center justify-between gap-3 text-sm">
                <span className="text-ink-muted">{ROUTE_LABELS[route]}</span>
                <span className="flex gap-2">
                  <select
                    aria-label={`Model for ${ROUTE_LABELS[route]}`}
                    className={`${inputClass} !w-auto`}
                    value={current.model}
                    onChange={(e) => setRoute(route, { model: e.target.value as AtlasModel })}
                  >
                    {ATLAS_MODELS.map((m) => (
                      <option key={m} value={m}>
                        {MODEL_LABELS[m]}
                      </option>
                    ))}
                  </select>
                  <select
                    aria-label={`Effort for ${ROUTE_LABELS[route]}`}
                    className={`${inputClass} !w-auto`}
                    value={current.effort}
                    onChange={(e) => setRoute(route, { effort: e.target.value as AtlasEffort })}
                  >
                    {ATLAS_EFFORTS.map((x) => (
                      <option key={x} value={x}>
                        {x}
                      </option>
                    ))}
                  </select>
                </span>
              </li>
            );
          })}
        </ul>
      </div>

      <div className="pt-4">
        <p className="mb-2 text-sm font-medium">Spending</p>
        <dl className="mb-3 grid grid-cols-3 gap-3 text-sm" data-testid="atlas-spend">
          {(['today', 'week', 'month'] as const).map((p) => (
            <div key={p}>
              <dt className="text-ink-muted">
                {p === 'today' ? 'Today' : p === 'week' ? 'This week' : 'This month'}
              </dt>
              <dd className="font-medium">{status ? money(status.spend[p]) : '…'}</dd>
            </div>
          ))}
        </dl>
        <div className="flex items-center gap-2 text-sm">
          <label htmlFor="atlas-cap" className="text-ink-muted">
            Monthly cap ($)
          </label>
          <input
            id="atlas-cap"
            inputMode="decimal"
            placeholder="no cap"
            className={`${inputClass} !w-28`}
            value={capText ?? (cap === null ? '' : String(cap))}
            onChange={(e) => setCapText(e.target.value)}
          />
          <button className={buttonQuiet} disabled={capText === null} onClick={saveCap}>
            Set cap
          </button>
        </div>
        <p className="mt-2 text-xs text-ink-muted">
          When the cap is reached Atlas stops answering and says so; the rest of Cortex keeps
          working. Costs are estimates from published prices (checked {status?.pricesChecked ?? '…'}
          ).
        </p>
        {status && status.recent.length > 0 && (
          <p className="mt-2 text-xs text-ink-muted" data-testid="atlas-cache-note">
            Last call read {status.recent[0]!.cacheReadTokens.toLocaleString()} tokens from the
            cache.
          </p>
        )}
      </div>
    </Card>
  );
}
