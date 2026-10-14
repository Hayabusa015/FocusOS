import type { UpdaterState } from '@shared/schemas';
import { ReleaseNotes } from './ReleaseNotes';

/** Shown once after an update, until dismissed (PLAN §11B). */
export function JustUpdatedCard({
  updated,
}: {
  updated: NonNullable<UpdaterState['justUpdated']>;
}) {
  return (
    <section aria-label="Updated" className="mb-6 rounded-card border border-win/40 bg-surface p-4">
      <div className="flex items-center justify-between gap-3">
        <p className="text-sm font-medium">Updated to Cortex {updated.version}</p>
        <button
          className="rounded-lg px-3 py-1.5 text-sm text-ink-muted hover:bg-raised hover:text-ink"
          onClick={() => void window.cortex.updater.dismissUpdated()}
        >
          Got it
        </button>
      </div>
      <div className="mt-3 border-t border-line pt-3">
        <ReleaseNotes notes={updated.releaseNotes} />
      </div>
    </section>
  );
}
