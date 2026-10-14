import type { ReactNode } from 'react';
import type { Area } from '@shared/core';
import { areaColor } from '@/lib/areas';

export function AreaDot({ area }: { area: Area | null | undefined }) {
  return (
    <span
      aria-hidden
      className="inline-block size-2.5 shrink-0 rounded-full"
      style={{ background: areaColor(area) }}
    />
  );
}

export function AreaTag({ area }: { area: Area | null | undefined }) {
  if (!area) return null;
  return (
    <span className="inline-flex items-center gap-1.5 text-xs text-ink-muted">
      <AreaDot area={area} />
      {area.name}
    </span>
  );
}

/** A progress ring: done this week out of everything on the board. */
export function Ring({ done, total, color }: { done: number; total: number; color: string }) {
  const radius = 9;
  const circumference = 2 * Math.PI * radius;
  const fraction = total === 0 ? 0 : Math.min(1, done / total);
  return (
    <svg
      width="24"
      height="24"
      viewBox="0 0 24 24"
      aria-hidden="true"
      data-done={done}
      data-total={total}
    >
      <circle cx="12" cy="12" r={radius} fill="none" strokeWidth="3" className="stroke-line" />
      <circle
        cx="12"
        cy="12"
        r={radius}
        fill="none"
        strokeWidth="3"
        strokeLinecap="round"
        stroke={color}
        strokeDasharray={circumference}
        strokeDashoffset={circumference * (1 - fraction)}
        transform="rotate(-90 12 12)"
      />
    </svg>
  );
}

export function Card({
  children,
  className = '',
  label,
}: {
  children: ReactNode;
  className?: string;
  label?: string;
}) {
  return (
    <section
      aria-label={label}
      className={`rounded-card border border-line bg-surface p-5 ${className}`}
    >
      {children}
    </section>
  );
}

export function SectionTitle({ children, hint }: { children: ReactNode; hint?: string }) {
  return (
    <div className="mb-3 flex items-baseline justify-between gap-4">
      <h2 className="text-sm font-semibold uppercase tracking-wide text-ink-muted">{children}</h2>
      {hint && <span className="text-xs text-ink-muted">{hint}</span>}
    </div>
  );
}

export function Empty({ title, children }: { title: string; children?: ReactNode }) {
  return (
    <div className="rounded-card border border-dashed border-line p-8 text-center">
      <p className="font-medium">{title}</p>
      {children && <p className="mx-auto mt-1 max-w-md text-sm text-ink-muted">{children}</p>}
    </div>
  );
}

export function ErrorNote({ message }: { message: string | null }) {
  if (!message) return null;
  return (
    <p role="alert" className="mb-4 rounded-lg border border-caution/40 p-3 text-sm text-caution">
      {message}
    </p>
  );
}

export const buttonPrimary =
  'rounded-lg bg-accent px-3 py-1.5 text-sm font-medium text-accent-ink transition-opacity hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-50';
export const buttonQuiet =
  'rounded-lg border border-line px-3 py-1.5 text-sm text-ink transition-colors hover:bg-raised disabled:cursor-not-allowed disabled:opacity-50';
export const inputClass =
  'w-full rounded-lg border border-line bg-ground px-3 py-2 text-sm text-ink placeholder:text-ink-muted';
