import { useEffect, useState } from 'react';
import type { AppInfo, UpdaterState } from '@shared/schemas';
import { CoreSettings } from '@/components/CoreSettings';
import { formatWhen } from '@/lib/format';

const STATUS_TEXT: Record<UpdaterState['status'], string> = {
  disabled: 'Off',
  idle: 'Not checked yet',
  checking: 'Checking…',
  available: 'An update is available',
  downloading: 'Downloading…',
  downloaded: 'Ready to install',
  'up-to-date': "You're up to date",
  error: "Couldn't check",
};

function Row({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex items-baseline justify-between gap-6 border-b border-line py-3 last:border-0">
      <dt className="text-sm text-ink-muted">{label}</dt>
      <dd className="text-right text-sm">{children}</dd>
    </div>
  );
}

export function SettingsPage({ updater }: { updater: UpdaterState | null }) {
  const [info, setInfo] = useState<AppInfo | null>(null);
  useEffect(() => {
    void window.cortex.app.info().then(setInfo);
  }, []);

  const canCheck =
    updater !== null &&
    !['disabled', 'checking', 'downloading', 'downloaded'].includes(updater.status);

  return (
    <div>
      <h1 className="mb-8 text-3xl font-semibold tracking-tight">Settings</h1>

      <section
        aria-labelledby="updates-heading"
        className="mb-6 rounded-card border border-line bg-surface p-6"
      >
        <div className="mb-2 flex items-center justify-between gap-4">
          <h2 id="updates-heading" className="text-lg font-semibold">
            Updates
          </h2>
          <button
            className="rounded-lg bg-accent px-3 py-1.5 text-sm font-medium text-accent-ink transition-opacity hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-50"
            disabled={!canCheck}
            onClick={() => void window.cortex.updater.check()}
          >
            Check for updates
          </button>
        </div>
        <dl>
          <Row label="Installed version">
            <span data-testid="installed-version">{info?.version ?? '…'}</span>
          </Row>
          <Row label="Latest version found">{updater?.latestVersion ?? '—'}</Row>
          <Row label="Last checked">{formatWhen(updater?.lastCheckedAt ?? null)}</Row>
          <Row label="Status">
            <span data-testid="update-status">{updater ? STATUS_TEXT[updater.status] : '…'}</span>
          </Row>
        </dl>
        {updater?.disabledReason && (
          <p className="mt-3 text-sm text-ink-muted">{updater.disabledReason}</p>
        )}
        {updater?.status === 'error' && updater.error && (
          <p className="mt-3 text-sm text-caution">
            Couldn&apos;t check for updates ({updater.error}). Cortex will try again in a few hours,
            or press Check for updates.
          </p>
        )}
      </section>

      <CoreSettings />

      <section
        aria-labelledby="about-heading"
        className="rounded-card border border-line bg-surface p-6"
      >
        <h2 id="about-heading" className="mb-2 text-lg font-semibold">
          Your data
        </h2>
        <dl>
          <Row label="Stored on this PC at">
            <code className="break-all text-xs text-ink-muted">{info?.dataDir ?? '…'}</code>
          </Row>
        </dl>
      </section>
    </div>
  );
}
