// @vitest-environment jsdom
import { describe, expect, it, vi } from 'vitest';
import { DEFAULT_SETTINGS } from '../../src/shared/core';
import type { VoiceClip } from '../../src/shared/voice';
import { pickFallbackVoice } from '../../src/renderer/lib/fallback-voice';
import { SentenceChunker, cleanForSpeech, splitSentences } from '../../src/renderer/lib/sentences';
import { createSpeaker } from '../../src/renderer/lib/speaker';
import type { SpeakerSettings } from '../../src/renderer/lib/speaker';

describe('splitting a reply into sentences', () => {
  it('splits plain sentences', () => {
    expect(splitSentences('Added it. Anything else? Right then!')).toEqual([
      'Added it.',
      'Anything else?',
      'Right then!',
    ]);
  });

  it('does not split on abbreviations, initials, decimals, times or file names', () => {
    expect(splitSentences('Ask Dr. Patel about it. Then call J. Smith.')).toEqual([
      'Ask Dr. Patel about it.',
      'Then call J. Smith.',
    ]);
    expect(splitSentences('It costs 3.5 dollars. Open notes.txt now.')).toEqual([
      'It costs 3.5 dollars.',
      'Open notes.txt now.',
    ]);
    expect(splitSentences('Lab starts at 3:30 p.m. today. Bring goggles.')).toEqual([
      'Lab starts at 3:30 p.m. today.',
      'Bring goggles.',
    ]);
  });

  it('keeps a closing quote with its sentence', () => {
    expect(splitSentences('She said "go." Then left.')).toEqual(['She said "go."', 'Then left.']);
  });

  it('releases a sentence only once its end is certain, however the text arrives', () => {
    const chunker = new SentenceChunker();
    const spoken: string[] = [];
    for (const piece of ['Grade the', ' lab reports.', ' Then', ' email Dr', '. Patel. ', 'Done']) {
      spoken.push(...chunker.push(piece));
    }
    expect(spoken).toEqual(['Grade the lab reports.', 'Then email Dr. Patel.']);
    expect(chunker.flush()).toEqual(['Done']);
  });

  it('ends a sentence at a line break (lists, paragraphs)', () => {
    expect(splitSentences('Three things\n- Print the quiz\n- Email parents')).toEqual([
      'Three things',
      'Print the quiz',
      'Email parents',
    ]);
  });

  it('cleans markdown so it is not read aloud', () => {
    expect(cleanForSpeech('**Done**: see `notes` and [the plan](https://x.test).')).toBe(
      'Done: see notes and the plan.',
    );
    expect(cleanForSpeech('## Heading\n- item')).toBe('Heading item');
  });
});

describe('the fallback voice (PLAN §8.3)', () => {
  const v = (name: string, lang: string) => ({ name, lang });
  it('prefers a British male voice', () => {
    const picked = pickFallbackVoice([
      v('Microsoft Zira - English (United States)', 'en-US'),
      v('Microsoft Hazel - English (United Kingdom)', 'en-GB'),
      v('Microsoft George - English (United Kingdom)', 'en-GB'),
    ]);
    expect(picked?.name).toContain('George');
  });
  it('then any British voice, then English, then none', () => {
    expect(pickFallbackVoice([v('Hazel', 'en-GB'), v('David', 'en-US')])?.name).toBe('Hazel');
    expect(pickFallbackVoice([v('Zira', 'en-US'), v('David', 'en-US')])?.name).toBe('David');
    expect(pickFallbackVoice([v('Hortense', 'fr-FR')])).toBeNull();
    expect(pickFallbackVoice([])).toBeNull();
  });
});

describe('the speaking queue', () => {
  const settings = (over: Partial<SpeakerSettings> = {}): SpeakerSettings => ({
    voiceEnabled: true,
    voiceVolume: 0.5,
    voiceEvents: { ...DEFAULT_SETTINGS.voiceEvents },
    quietStart: '21:30',
    quietEnd: '06:30',
    ...over,
  });
  const noon = () => new Date(2026, 9, 15, 12, 0, 0);
  const ok = (text: string, cached = false): VoiceClip => ({
    ok: true,
    audio: new Uint8Array([1, 2, 3, text.length]),
    mime: 'audio/wav',
    cached,
    ms: 5,
  });

  function harness(
    over: {
      settings?: SpeakerSettings;
      now?: () => Date;
      clip?: (t: string) => Promise<VoiceClip>;
      fallback?: boolean;
    } = {},
  ) {
    const log: string[] = [];
    const finish: Record<string, () => void> = {};
    const s = over.settings ?? settings();
    const speaker = createSpeaker({
      settings: () => s,
      now: over.now ?? noon,
      fetchClip: over.clip ?? (async (t) => ok(t)),
      playClip: (clip) => {
        const text = `clip:${clip.audio[3]}`;
        log.push(`play ${text}`);
        return {
          done: new Promise<void>((r) => (finish[text] = r)),
          stop: () => log.push(`stop ${text}`),
        };
      },
      fallback:
        over.fallback === false
          ? null
          : {
              speak: (text, volume) => {
                log.push(`fallback "${text}" @${volume}`);
                return { done: Promise.resolve(), stop: () => undefined };
              },
            },
      onFallback: (a) => log.push(`badge ${a}`),
    });
    return { speaker, log, finish };
  }
  const tick = () => new Promise((r) => setTimeout(r, 0));

  it('plays lines strictly in order, starting the next as the last ends', async () => {
    const { speaker, log, finish } = harness();
    speaker.say('One.');
    speaker.say('Two..');
    await tick();
    expect(log.filter((l) => l.startsWith('play'))).toEqual(['play clip:4']);
    finish['clip:4']!();
    await tick();
    expect(log.filter((l) => l.startsWith('play'))).toEqual(['play clip:4', 'play clip:5']);
  });

  it('asks for every line at once, so the second is ready when the first ends', async () => {
    const asked: string[] = [];
    const { speaker } = harness({
      clip: async (t) => {
        asked.push(t);
        return ok(t);
      },
    });
    speaker.say('First sentence.');
    speaker.say('Second sentence.');
    expect(asked).toEqual(['First sentence.', 'Second sentence.']); // both requested immediately
  });

  it('says nothing when speech is off, in quiet hours, or for an event turned off', () => {
    expect(harness({ settings: settings({ voiceEnabled: false }) }).speaker.say('Hi.')).toBe(false);
    expect(harness({ now: () => new Date(2026, 9, 15, 22, 0) }).speaker.say('Hi.')).toBe(false);
    expect(harness({ now: () => new Date(2026, 9, 15, 5, 0) }).speaker.say('Hi.')).toBe(false);
    const off = settings({ voiceEvents: { ...DEFAULT_SETTINGS.voiceEvents, blocks: false } });
    const h = harness({ settings: off });
    expect(h.speaker.say('Next up.', { event: 'blocks' })).toBe(false);
    expect(h.speaker.say('Well done.', { event: 'completion' })).toBe(true);
  });

  it('a button the user pressed is spoken even if speech is off or it is quiet hours', () => {
    const h = harness({
      settings: settings({ voiceEnabled: false }),
      now: () => new Date(2026, 9, 15, 23, 0),
    });
    expect(h.speaker.say('Preview.', { force: true })).toBe(true);
  });

  it("uses the computer's voice when VoiceStudio is down, and shows it", async () => {
    const { speaker, log } = harness({
      clip: async () => ({ ok: false, reason: 'down', message: 'gone' }),
    });
    speaker.say('Hello there.');
    await tick();
    expect(log).toContain('badge true');
    expect(log).toContain('fallback "Hello there." @0.5');
  });

  it('treats a failed request like a down VoiceStudio, never as an error', async () => {
    const { speaker, log } = harness({
      clip: () => Promise.reject(new Error('ipc broke')),
    });
    speaker.say('Still here.');
    await tick();
    expect(log).toContain('fallback "Still here." @0.5');
  });

  it('is silent, not broken, when there is no fallback voice either', async () => {
    const { speaker, log } = harness({
      fallback: false,
      clip: async () => ({ ok: false, reason: 'down', message: 'gone' }),
    });
    expect(() => speaker.say('Anyone?')).not.toThrow();
    await tick();
    expect(log.some((l) => l.startsWith('play') || l.startsWith('fallback'))).toBe(false);
  });

  it('hides the badge again once VoiceStudio is back', async () => {
    let down = true;
    const { speaker, log, finish } = harness({
      clip: async (t) => (down ? { ok: false, reason: 'down', message: 'gone' } : ok(t)),
    });
    speaker.say('One.');
    await tick();
    down = false;
    speaker.say('Two.');
    await tick();
    finish['clip:4']?.();
    expect(log.filter((l) => l.startsWith('badge'))).toEqual(['badge true', 'badge false']);
  });

  it('stop() silences what is playing and drops what is waiting', async () => {
    const { speaker, log } = harness();
    speaker.say('Long reply.');
    speaker.say('And more.');
    await tick();
    speaker.stop();
    await tick();
    expect(log).toContain('stop clip:11');
    expect(log.filter((l) => l.startsWith('play'))).toEqual(['play clip:11']);
    expect(speaker.busy).toBe(false);
  });

  it('reports the time to first sound once per burst, and whether it came from the cache', async () => {
    const first = vi.fn();
    const finish: (() => void)[] = [];
    const speaker = createSpeaker({
      settings: () => settings(),
      now: noon,
      fetchClip: async (t) => ok(t, true),
      playClip: () => ({ done: new Promise<void>((r) => finish.push(r)), stop: () => undefined }),
      fallback: null,
      onFirstAudio: first,
    });
    speaker.say('One.');
    speaker.say('Two.');
    await tick();
    expect(first).toHaveBeenCalledTimes(1);
    expect(first.mock.calls[0]![1]).toBe(true);
    finish[0]!();
    await tick();
    finish[1]!();
    await tick();
    speaker.say('Three.');
    await tick();
    expect(first).toHaveBeenCalledTimes(2); // a new burst
  });
});
