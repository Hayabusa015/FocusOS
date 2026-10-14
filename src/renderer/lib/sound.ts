let context: AudioContext | null = null;

function tone(ctx: AudioContext, frequency: number, start: number, length: number, volume: number) {
  const osc = ctx.createOscillator();
  const gain = ctx.createGain();
  osc.type = 'sine';
  osc.frequency.value = frequency;
  gain.gain.setValueAtTime(0.0001, start);
  gain.gain.exponentialRampToValueAtTime(volume, start + 0.02);
  gain.gain.exponentialRampToValueAtTime(0.0001, start + length);
  osc.connect(gain).connect(ctx.destination);
  osc.start(start);
  osc.stop(start + length + 0.05);
}

/** A soft chime made in the browser, so there is no sound file to ship. Quiet by design. */
export function playChime(big: boolean): void {
  try {
    context ??= new AudioContext();
    const ctx = context;
    if (ctx.state === 'suspended') void ctx.resume();
    const t = ctx.currentTime;
    if (big) {
      [523.25, 659.25, 783.99, 1046.5].forEach((f, i) => tone(ctx, f, t + i * 0.09, 0.45, 0.07));
    } else {
      tone(ctx, 880, t, 0.28, 0.06);
      tone(ctx, 1318.5, t + 0.07, 0.3, 0.04);
    }
  } catch {
    // No audio device: celebrating without a sound is fine.
  }
}
