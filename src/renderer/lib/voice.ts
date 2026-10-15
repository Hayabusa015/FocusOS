import { useSyncExternalStore } from 'react';
import type { AppSettings } from '@shared/core';
import { pickFallbackVoice } from './fallback-voice';
import { createSpeaker } from './speaker';
import type { Playback, SpeakerSettings } from './speaker';

/**
 * The speaker as the rest of the screen uses it: one queue for the whole window, fed the user's
 * settings, playing clips from the main process and falling back to Windows' own voice.
 */
let settings: SpeakerSettings = {
  voiceEnabled: false,
  voiceVolume: 0.8,
  voiceEvents: { briefing: true, blocks: true, completion: true, focus: true, shutdown: true },
  quietStart: '21:30',
  quietEnd: '06:30',
};

/** Called by the app whenever settings load or change. */
export function setVoiceSettings(s: AppSettings): void {
  settings = {
    voiceEnabled: s.voiceEnabled,
    voiceVolume: s.voiceVolume,
    voiceEvents: s.voiceEvents,
    quietStart: s.quietStart,
    quietEnd: s.quietEnd,
  };
}

// --- the "fallback voice" badge ------------------------------------------------------------------
let fallbackActive = false;
const listeners = new Set<() => void>();
function setFallback(active: boolean): void {
  if (fallbackActive === active) return;
  fallbackActive = active;
  listeners.forEach((l) => l());
}
/** True while Atlas is speaking with the computer's own voice because VoiceStudio is not there. */
export function useFallbackBadge(): boolean {
  return useSyncExternalStore(
    (cb) => {
      listeners.add(cb);
      return () => listeners.delete(cb);
    },
    () => fallbackActive,
  );
}

// --- "Atlas is speaking": for the Stop button ---------------------------------------------------------
let speakingNow = false;
const speakingListeners = new Set<() => void>();
function setSpeaking(busy: boolean): void {
  if (speakingNow === busy) return;
  speakingNow = busy;
  speakingListeners.forEach((l) => l());
}
export function useSpeaking(): boolean {
  return useSyncExternalStore(
    (cb) => {
      speakingListeners.add(cb);
      return () => speakingListeners.delete(cb);
    },
    () => speakingNow,
  );
}

// --- playing a clip ----------------------------------------------------------------------------------
function playBlob(audio: Uint8Array, mime: string, volume: number): Playback {
  const url = URL.createObjectURL(new Blob([audio as BlobPart], { type: mime }));
  const el = new Audio(url);
  el.volume = Math.min(1, Math.max(0, volume));
  let timer: ReturnType<typeof setTimeout> | undefined;
  const done = new Promise<void>((resolve) => {
    const end = () => {
      clearTimeout(timer);
      URL.revokeObjectURL(url);
      resolve();
    };
    // A clip that never reports that it ended (no output device, a stuck driver) must not hold up
    // everything behind it: give up a little after it should have finished.
    timer = setTimeout(end, 15_000);
    el.addEventListener(
      'loadedmetadata',
      () => {
        clearTimeout(timer);
        const ms = Number.isFinite(el.duration) ? el.duration * 1000 : 15_000;
        timer = setTimeout(end, ms + 1500);
      },
      { once: true },
    );
    el.addEventListener('ended', end, { once: true });
    el.addEventListener('error', end, { once: true });
    el.play().catch(end);
  });
  return {
    done,
    stop: () => {
      el.pause();
      el.dispatchEvent(new Event('ended'));
    },
  };
}

// --- the computer's own voice ---------------------------------------------------------------------------
function speechSynthesisFallback() {
  if (typeof window === 'undefined' || !('speechSynthesis' in window)) return null;
  const synth = window.speechSynthesis;
  return {
    speak(text: string, volume: number): Playback {
      const utter = new SpeechSynthesisUtterance(text);
      const voice = pickFallbackVoice(synth.getVoices());
      if (voice) {
        utter.voice = voice;
        utter.lang = voice.lang;
      } else utter.lang = 'en-GB';
      utter.volume = Math.min(1, Math.max(0, volume));
      utter.rate = 0.95;
      const done = new Promise<void>((resolve) => {
        utter.onend = () => resolve();
        utter.onerror = () => resolve();
      });
      synth.speak(utter);
      return { done, stop: () => synth.cancel() };
    },
  };
}

export const speaker = createSpeaker({
  settings: () => settings,
  now: () => new Date(),
  fetchClip: (text) => window.cortex.voice.speak(text),
  playClip: (clip, volume) => playBlob(clip.audio, clip.mime, volume),
  fallback: speechSynthesisFallback(),
  onFallback: setFallback,
  onBusy: setSpeaking,
  onFirstAudio: (ms, cached) =>
    console.debug(`[voice] first audio in ${ms} ms${cached ? ' (cached)' : ''}`),
});

/**
 * Plays a line in a candidate voice (Settings → Voice). Returns a sentence for the screen when it
 * cannot: the preview only ever works through VoiceStudio, since the computer's own voice would say
 * nothing about the candidate.
 */
export async function previewVoice(
  text: string,
  design: { instruct: string; seed: number },
  volume: number,
): Promise<{ ok: true } | { ok: false; message: string }> {
  speaker.stop();
  try {
    const clip = await window.cortex.voice.preview(text, design);
    if (!clip.ok) {
      return {
        ok: false,
        message:
          clip.reason === 'down'
            ? 'VoiceStudio is not running, so there is nothing to preview. Start it and try again.'
            : `VoiceStudio could not make that voice: ${clip.message}`,
      };
    }
    await playBlob(clip.audio, clip.mime, volume).done;
    return { ok: true };
  } catch (e) {
    return { ok: false, message: e instanceof Error ? e.message : 'The preview failed.' };
  }
}
