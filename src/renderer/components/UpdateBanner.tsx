import { useState } from 'react';
import type { UpdaterState } from '@shared/schemas';
import { useIsSnoozed } from '@/hooks/useUpdaterState';
import { ReleaseNotes } from './ReleaseNotes';

const button =
  'rounded-lg px-3 py-1.5 text-sm font-medium transition-colors disabled:cursor-not-allowed disabled:opacity-50';
const primary = `${button} bg-accent text-accent-ink hover:opacity-90`;
const quiet = `${button} text-ink-muted hover:bg-raised hover:text-ink`;

/** The banner from PLAN §11B: available → downloading → ready to restart. */
export function UpdateBanner({ state }: { state: UpdaterState }) {
  const [showNotes, setShowNotes] = useState(false);
  const snoozed = useIsSnoozed(state.snoozedUntil);
  const version = state.latestVersion;

  const shell = (children: React.ReactNode) => (
    <section
      role="status"
      aria-live="polite"
      aria-label="Update"
      className="mb-6 rounded-card border border-accent/40 bg-surface p-4"
    >
      {children}
    </section>
  );

  if (state.status === 'downloading') {
    const percent = state.progressPercent ?? 0;
    return shell(
      <>
        <p className="text-sm">
          Downloading Cortex {version}… {percent}%
        </p>
        <div
          className="mt-3 h-2 overflow-hidden rounded-full bg-raised"
          role="progressbar"
          aria-valuenow={percent}
          aria-valuemin={0}
          aria-valuemax={100}
        >
          <div className="h-full bg-accent transition-[width]" style={{ width: `${percent}%` }} />
        </div>
      </>,
    );
  }

  if (state.status === 'downloaded') {
    return shell(
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <p className="text-sm font-medium">Cortex {version} is ready to install.</p>
          <p className="text-sm text-ink-muted">
            {state.busy
              ? "You're in the middle of something, so the restart waits until you finish."
              : 'Cortex will restart for a moment. Your data is backed up first.'}
          </p>
        </div>
        <button
          className={primary}
          disabled={state.busy}
          onClick={() => void window.cortex.updater.install()}
        >
          Restart to install
        </button>
      </div>,
    );
  }

  if (state.status === 'available' && version && !snoozed) {
    return shell(
      <>
        <div className="flex flex-wrap items-center justify-between gap-3">
          <p className="text-sm font-medium">Cortex {version} is available.</p>
          <div className="flex items-center gap-1">
            <button
              className={quiet}
              aria-expanded={showNotes}
              onClick={() => setShowNotes((v) => !v)}
            >
              What&apos;s new
            </button>
            <button className={quiet} onClick={() => void window.cortex.updater.snooze(version)}>
              Later
            </button>
            <button className={primary} onClick={() => void window.cortex.updater.download()}>
              Update now
            </button>
          </div>
        </div>
        {state.error && (
          <p className="mt-2 text-sm text-caution">
            Download didn&apos;t finish ({state.error}). Try again.
          </p>
        )}
        {showNotes && (
          <div className="mt-3 border-t border-line pt-3">
            <ReleaseNotes notes={state.releaseNotes} />
          </div>
        )}
      </>,
    );
  }

  return null;
}
