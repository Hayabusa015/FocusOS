import { inQuietHours } from '@shared/quiet';
import type { SpeakingEvent, VoiceClip, VoiceEvents } from '@shared/voice';

/** What the speaker needs to know about the user's settings. */
export interface SpeakerSettings {
  voiceEnabled: boolean;
  voiceVolume: number;
  voiceEvents: VoiceEvents;
  quietStart: string;
  quietEnd: string;
}

/** Something that plays one clip and says when it has finished. */
export interface Playback {
  done: Promise<void>;
  stop(): void;
}

export interface SpeakerDeps {
  settings(): SpeakerSettings;
  now(): Date;
  /** Asks the main process for audio in the chosen voice. */
  fetchClip(text: string): Promise<VoiceClip>;
  playClip(clip: Extract<VoiceClip, { ok: true }>, volume: number): Playback;
  /** The computer's own voice. Null when there is none (the fallback is then silent). */
  fallback: { speak(text: string, volume: number): Playback } | null;
  /** True while the fallback voice is being used, for the "fallback voice" badge. */
  onFallback?(active: boolean): void;
  /** Time from asking to first sound for the first line of a burst, in milliseconds. */
  onFirstAudio?(ms: number, cached: boolean): void;
  /** True while anything is playing or waiting, false once it all stops (for a Stop button). */
  onBusy?(busy: boolean): void;
}

export interface SayOptions {
  /** Which spoken event this is. An event the user turned off is not spoken. */
  event?: SpeakingEvent;
  /** A button the user pressed (a preview). Ignores the on/off switch and quiet hours. */
  force?: boolean;
}

interface Item {
  text: string;
  clip: Promise<VoiceClip | null>;
  asked: number;
  first: boolean;
}

/**
 * The speaking queue. `say` may be called for each sentence as it arrives; every line is requested
 * at once, so line two is usually ready the moment line one ends, and they play strictly in order.
 * It never throws: a problem means the fallback voice, or silence.
 */
export function createSpeaker(deps: SpeakerDeps) {
  const queue: Item[] = [];
  let running = false;
  let current: Playback | null = null;
  let generation = 0;
  let burstOpen = false;

  const allowed = (opts: SayOptions): boolean => {
    if (opts.force) return true;
    const s = deps.settings();
    if (!s.voiceEnabled) return false;
    if (opts.event && !s.voiceEvents[opts.event]) return false;
    const now = deps.now();
    const time = `${String(now.getHours()).padStart(2, '0')}:${String(now.getMinutes()).padStart(2, '0')}`;
    return !inQuietHours(time, { start: s.quietStart, end: s.quietEnd });
  };

  async function run(): Promise<void> {
    if (running) return;
    running = true;
    const mine = generation;
    deps.onBusy?.(true);
    try {
      while (queue.length > 0 && mine === generation) {
        const item = queue.shift() as Item;
        const volume = deps.settings().voiceVolume;
        const clip = await item.clip;
        if (mine !== generation) return;
        if (clip && clip.ok) {
          deps.onFallback?.(false);
          if (item.first) deps.onFirstAudio?.(Date.now() - item.asked, clip.cached);
          current = deps.playClip(clip, volume);
        } else if (deps.fallback) {
          deps.onFallback?.(true);
          if (item.first) deps.onFirstAudio?.(Date.now() - item.asked, false);
          current = deps.fallback.speak(item.text, volume);
        } else {
          current = null;
        }
        if (current) await current.done.catch(() => undefined);
        if (mine !== generation) return;
        current = null;
      }
    } finally {
      // A loop that was stopped must not mark a newer loop as finished.
      if (mine === generation) {
        running = false;
        if (queue.length === 0) {
          burstOpen = false;
          deps.onBusy?.(false);
        }
      }
    }
  }

  return {
    /** Queues a line. Returns false if it will not be spoken (off, quiet hours, event turned off). */
    say(text: string, opts: SayOptions = {}): boolean {
      const clean = text.trim();
      if (!clean || !allowed(opts)) return false;
      const first = !burstOpen;
      burstOpen = true;
      const item: Item = {
        text: clean,
        asked: Date.now(),
        first,
        clip: deps.fetchClip(clean).catch(() => null),
      };
      queue.push(item);
      void run();
      return true;
    },

    /** Stops speaking now and drops everything waiting. */
    stop(): void {
      generation++;
      queue.length = 0;
      running = false;
      burstOpen = false;
      current?.stop();
      current = null;
      deps.onBusy?.(false);
    },

    /** True while anything is playing or waiting. */
    get busy(): boolean {
      return running || queue.length > 0;
    },
  };
}
export type Speaker = ReturnType<typeof createSpeaker>;
