import { useCallback, useEffect, useState } from 'react';
import { useLive } from '@/hooks/useLive';
import { playChime } from '@/lib/sound';

interface Burst {
  id: number;
  xp: number;
  big: boolean;
  titles: string[];
}

// The confetti colours are the brand and win tokens, never hex values.
const COLOURS = [
  'var(--color-brand-gold)',
  'var(--color-brand-violet)',
  'var(--color-win)',
  'var(--color-area-chemistry)',
  'var(--color-area-coaching)',
];

/** A fixed spread of pieces: positions come from the index, so a render is always the same. */
const PIECES = Array.from({ length: 48 }, (_, i) => ({
  left: `${(i * 37) % 100}%`,
  delay: `${((i * 53) % 60) / 100}s`,
  drift: `${((i * 29) % 160) - 80}px`,
  spin: `${360 + ((i * 71) % 540)}deg`,
  colour: COLOURS[i % COLOURS.length],
}));

let nextId = 1;

/**
 * The moment of finishing something: a "+10 XP" pill with a check, a soft sound, and confetti for a
 * large task, a frog or a cleared day. Achievements get their own banner. Both are switched off
 * in Settings, and the motion stops entirely when Windows asks for reduced motion.
 */
export function Celebration() {
  const loadSettings = useCallback(() => window.cortex.settings.get(), []);
  const settings = useLive(loadSettings).data?.settings;
  const celebrations = settings?.celebrations ?? true;
  const sound = settings?.sound ?? true;
  const [bursts, setBursts] = useState<Burst[]>([]);

  useEffect(
    () =>
      window.cortex.onDataChanged((change) => {
        const xp = change.xp ?? 0;
        const titles = (change.unlocked ?? []).map((u) => u.title);
        if (xp <= 0 && titles.length === 0) return;
        const big = Boolean(change.big) || titles.length > 0;
        if (sound) playChime(big);
        if (!celebrations) return;
        const id = nextId++;
        setBursts((all) => [...all, { id, xp: Math.max(0, xp), big, titles }]);
        setTimeout(() => setBursts((all) => all.filter((b) => b.id !== id)), 3200);
      }),
    [celebrations, sound],
  );

  if (bursts.length === 0) return null;
  return (
    <div aria-live="polite" className="pointer-events-none fixed inset-0 z-[60]">
      {bursts.map((burst) => (
        <div key={burst.id} data-testid="celebration">
          {burst.big &&
            PIECES.map((p, i) => (
              <span
                key={i}
                className="confetti-piece"
                style={
                  {
                    left: p.left,
                    animationDelay: p.delay,
                    background: p.colour,
                    '--drift': p.drift,
                    '--spin': p.spin,
                  } as React.CSSProperties
                }
              />
            ))}
          <div className="absolute right-6 top-6 flex flex-col items-end gap-2">
            {burst.xp > 0 && (
              <div className="xp-pill flex items-center gap-2 rounded-full bg-accent px-4 py-2 text-sm font-semibold text-accent-ink shadow-lg">
                <span aria-hidden>✓</span>
                <span data-testid="celebration-xp">+{burst.xp} XP</span>
              </div>
            )}
            {burst.titles.map((title) => (
              <div
                key={title}
                className="xp-pill rounded-card border border-line bg-surface px-4 py-2 text-sm shadow-lg"
              >
                <span className="text-xs font-semibold uppercase tracking-wide text-accent-soft">
                  Achievement unlocked
                </span>
                <span className="block font-medium">{title}</span>
              </div>
            ))}
          </div>
        </div>
      ))}
    </div>
  );
}
