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
export function Ring({
  done,
  total,
  color,
  size = 24,
  trackClass = 'stroke-line',
}: {
  done: number;
  total: number;
  color: string;
  size?: number;
  /** The empty part of the ring. The dark rail needs a different one. */
  trackClass?: string;
}) {
  const radius = 9;
  const circumference = 2 * Math.PI * radius;
  const fraction = total === 0 ? 0 : Math.min(1, done / total);
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      aria-hidden="true"
      data-done={done}
      data-total={total}
    >
      <circle cx="12" cy="12" r={radius} fill="none" strokeWidth="3" className={trackClass} />
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

/**
 * A section of a page. It is open: a rule above it and space, not a box. The one thing on a page
 * that earns a box is the list you act on, which uses `Sheet`.
 */
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
    <section aria-label={label} className={`border-t border-line pt-4 ${className}`}>
      {children}
    </section>
  );
}

/** The raised sheet: where the work is. Used once or twice a page, never for decoration. */
export function Sheet({
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
      <h2 className="text-base font-semibold text-ink">{children}</h2>
      {hint && <span className="text-xs text-ink-muted">{hint}</span>}
    </div>
  );
}

export function Empty({ title, children }: { title: string; children?: ReactNode }) {
  return (
    <div className="border-y border-dashed border-line py-8 text-center">
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

/** The gold "Press" button: lifts on hover, sinks when pressed. */
export const buttonPrimary = 'btn btn-press';
export const buttonQuiet =
  'rounded-lg border border-line bg-surface px-3 py-1.5 text-sm text-ink transition-colors hover:bg-raised disabled:cursor-not-allowed disabled:opacity-50';
export const inputClass =
  'w-full rounded-lg border border-line bg-ground px-3 py-2 text-sm text-ink placeholder:text-ink-muted';

/** A check mark box. The real checkbox is underneath, so keyboards and screen readers work. */
export function Check({
  checked,
  onChange,
  label,
  round = false,
}: {
  checked: boolean;
  onChange(next: boolean): void;
  label: string;
  round?: boolean;
}) {
  return (
    <span className={`check ${round ? 'check-round' : ''}`}>
      <input
        type="checkbox"
        checked={checked}
        aria-label={label}
        onChange={(e) => onChange(e.target.checked)}
      />
      <span className="box" />
    </span>
  );
}

/** An on/off switch (the pill). */
export function Switch({
  checked,
  onChange,
  label,
}: {
  checked: boolean;
  onChange(next: boolean): void;
  label: string;
}) {
  return (
    <span className="switch">
      <input
        type="checkbox"
        role="switch"
        checked={checked}
        aria-label={label}
        onChange={(e) => onChange(e.target.checked)}
      />
      <span className="track" />
    </span>
  );
}

/** The glowing spinner, for anything that is loading. */
export function Loading({ label = 'Loading' }: { label?: string }) {
  return (
    <div className="flex justify-center py-10">
      <div
        className="loader-glow"
        style={{ '--size': '3rem' } as React.CSSProperties}
        role="status"
        aria-label={label}
      />
    </div>
  );
}
