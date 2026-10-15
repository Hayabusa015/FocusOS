import { ALL_FIXED_LINES, voiceId } from '@shared/voice';
import type { VoiceDesign } from '@shared/voice';
import { cacheKey } from './audio-cache';
import type { AudioCache } from './audio-cache';
import { VoiceDownError } from './voicestudio';
import type { SpeechBackend } from './voicestudio';

export type SpeakResult =
  | { ok: true; bytes: Uint8Array; mime: string; cached: boolean; ms: number }
  | { ok: false; reason: 'down' | 'error'; message: string };

export interface VoiceStatus {
  backend: 'up' | 'down';
  /** Fixed lines already rendered in the current voice, out of all of them. */
  fixedCached: number;
  fixedTotal: number;
}

/** After a failure, stop trying for this long, so a missing VoiceStudio never slows speech down. */
const DOWN_FOR_MS = 15_000;

export interface VoiceServiceDeps {
  backend: SpeechBackend;
  cache: AudioCache;
  design: () => VoiceDesign;
  now?: () => number;
  log?: (message: string) => void;
}

/**
 * Speaking, as the rest of Cortex sees it: ask for a line, get audio or a quiet "use the fallback".
 * It never throws and never shows an error: Cortex works the same with VoiceStudio gone.
 */
export function createVoiceService(deps: VoiceServiceDeps) {
  const now = deps.now ?? Date.now;
  let downUntil = 0;
  const inFlight = new Map<string, Promise<SpeakResult>>();

  async function render(text: string, design: VoiceDesign): Promise<SpeakResult> {
    const key = cacheKey(voiceId(design), text);
    const started = now();
    const hit = deps.cache.get(key);
    if (hit) return { ok: true, ...hit, cached: true, ms: now() - started };
    if (now() < downUntil)
      return { ok: false, reason: 'down', message: 'VoiceStudio is not running' };

    const pending = inFlight.get(key);
    if (pending) return pending;
    const job = (async (): Promise<SpeakResult> => {
      try {
        const clip = await deps.backend.synthesize(text, design);
        deps.cache.put(key, clip.bytes, clip.mime);
        downUntil = 0;
        return { ok: true, ...clip, cached: false, ms: now() - started };
      } catch (error) {
        if (error instanceof VoiceDownError) {
          downUntil = now() + DOWN_FOR_MS;
          return { ok: false, reason: 'down', message: error.message };
        }
        deps.log?.(
          `VoiceStudio speech failed: ${error instanceof Error ? error.message : String(error)}`,
        );
        return {
          ok: false,
          reason: 'error',
          message: error instanceof Error ? error.message : 'speech failed',
        };
      } finally {
        inFlight.delete(key);
      }
    })();
    inFlight.set(key, job);
    return job;
  }

  return {
    /** Speaks in the user's chosen voice. */
    speak(text: string): Promise<SpeakResult> {
      const clean = text.trim();
      if (!clean) return Promise.resolve({ ok: false, reason: 'error', message: 'nothing to say' });
      return render(clean, deps.design());
    },

    /** Speaks in another voice (the candidate preview). */
    preview(text: string, design: VoiceDesign): Promise<SpeakResult> {
      return render(text.trim(), design);
    },

    async status(): Promise<VoiceStatus> {
      const up = await deps.backend.health();
      if (up) downUntil = 0;
      else downUntil = Math.max(downUntil, now() + DOWN_FOR_MS);
      const id = voiceId(deps.design());
      return {
        backend: up ? 'up' : 'down',
        fixedCached: ALL_FIXED_LINES.filter((l) => deps.cache.has(cacheKey(id, l))).length,
        fixedTotal: ALL_FIXED_LINES.length,
      };
    },

    /** Renders the fixed lines that are not cached yet, one at a time. Stops if VoiceStudio is gone. */
    async prerender(): Promise<{ rendered: number; skipped: number; failed: number }> {
      const design = deps.design();
      const id = voiceId(design);
      let rendered = 0;
      let skipped = 0;
      let failed = 0;
      for (const line of ALL_FIXED_LINES) {
        if (deps.cache.has(cacheKey(id, line))) {
          skipped++;
          continue;
        }
        const result = await render(line, design);
        if (result.ok) rendered++;
        else {
          failed++;
          if (result.reason === 'down') break;
        }
      }
      return { rendered, skipped, failed };
    },

    /** Speech to text. Returns null when VoiceStudio is not there. */
    async transcribe(
      bytes: Uint8Array,
      mime: string,
    ): Promise<
      { ok: true; text: string } | { ok: false; reason: 'down' | 'error'; message: string }
    > {
      try {
        return { ok: true, text: await deps.backend.transcribe(bytes, mime) };
      } catch (error) {
        if (error instanceof VoiceDownError) {
          downUntil = now() + DOWN_FOR_MS;
          return { ok: false, reason: 'down', message: error.message };
        }
        return {
          ok: false,
          reason: 'error',
          message: error instanceof Error ? error.message : 'transcription failed',
        };
      }
    },
  };
}
export type VoiceService = ReturnType<typeof createVoiceService>;
