import { useMemo } from 'react';
import { releaseNotesToSafeHtml } from '@/lib/notes';

export function ReleaseNotes({ notes }: { notes: string | null }) {
  const html = useMemo(() => (notes ? releaseNotesToSafeHtml(notes) : ''), [notes]);
  if (!html) {
    return (
      <p className="text-sm text-ink-muted">No release notes were published for this version.</p>
    );
  }
  return (
    <div
      className="max-h-56 space-y-2 overflow-y-auto text-sm text-ink-muted [&_h1]:text-base [&_h1]:font-semibold [&_h2]:font-semibold [&_h2]:text-ink [&_li]:ml-4 [&_li]:list-disc [&_strong]:text-ink"
      // Safe: sanitised to a short tag allowlist with no attributes (lib/notes.ts, unit tested).
      dangerouslySetInnerHTML={{ __html: html }}
    />
  );
}
