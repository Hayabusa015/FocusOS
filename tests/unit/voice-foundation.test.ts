import { mkdtempSync, readdirSync, rmSync, statSync, utimesSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { AppSettings, DEFAULT_SETTINGS } from '../../src/shared/core';
import {
  ALL_FIXED_LINES,
  DEFAULT_VOICE,
  FIXED_LINES,
  VOICE_CANDIDATES,
  VoiceDesign,
  briefingLine,
  completionLine,
  focusStartLine,
  instructProblem,
  nextUpLine,
  voiceId,
} from '../../src/shared/voice';
import { inQuietHours } from '../../src/shared/quiet';
import { cacheKey, createAudioCache } from '../../src/main/voice/audio-cache';
import { createVoiceService } from '../../src/main/voice/service';
import {
  VoiceDownError,
  VoiceRequestError,
  createVoiceStudioBackend,
} from '../../src/main/voice/voicestudio';
import type { SpeechBackend } from '../../src/main/voice/voicestudio';

const WAV = new Uint8Array(200).fill(7);
let dir: string;
beforeEach(() => {
  dir = mkdtempSync(join(tmpdir(), 'cortex-voice-'));
});
afterEach(() => rmSync(dir, { recursive: true, force: true }));

describe('the voice design (PLAN §8.2, docs/VOICESTUDIO.md)', () => {
  it('starts as the plan says: male, middle-aged, low pitch, british, and no style', () => {
    expect(DEFAULT_VOICE.instruct).toBe('male, middle-aged, low pitch, british accent');
    expect(DEFAULT_VOICE.instruct).not.toContain('whisper');
    expect(instructProblem(DEFAULT_VOICE.instruct)).toBeNull();
  });

  it('only allows attributes VoiceStudio knows, one per category', () => {
    expect(instructProblem('male, elderly, low pitch, whisper')).toBeNull();
    expect(instructProblem('Male, British Accent')).toBeNull(); // case does not matter
    expect(instructProblem('male, grumpy')).toMatch(/not an attribute/);
    expect(instructProblem('male, female')).toMatch(/Only one gender/);
    expect(instructProblem('low pitch, high pitch')).toMatch(/Only one pitch/);
    expect(instructProblem('  ')).toMatch(/at least one/);
  });

  it('offers three to five candidates, all valid, all different, the first being the start', () => {
    expect(VOICE_CANDIDATES.length).toBeGreaterThanOrEqual(3);
    expect(VOICE_CANDIDATES.length).toBeLessThanOrEqual(5);
    for (const c of VOICE_CANDIDATES) expect(VoiceDesign.safeParse(c.design).success).toBe(true);
    expect(new Set(VOICE_CANDIDATES.map((c) => voiceId(c.design))).size).toBe(
      VOICE_CANDIDATES.length,
    );
    expect(VOICE_CANDIDATES[0]!.design).toEqual(DEFAULT_VOICE);
  });

  it('is never cloned: nothing in the design names a person or a clip', () => {
    for (const c of VOICE_CANDIDATES)
      expect(c.design.instruct).not.toMatch(/clone|actor|film|movie/i);
  });
});

describe('settings', () => {
  it('speech is off by default, with a sensible volume and every event on', () => {
    expect(DEFAULT_SETTINGS.voiceEnabled).toBe(false);
    expect(DEFAULT_SETTINGS.voiceVolume).toBeGreaterThan(0);
    expect(Object.values(DEFAULT_SETTINGS.voiceEvents).every(Boolean)).toBe(true);
    expect(DEFAULT_SETTINGS.voiceHotkey).toBe('Control+Alt+Space');
    expect(AppSettings.safeParse(DEFAULT_SETTINGS).success).toBe(true);
  });

  it('refuses a voice VoiceStudio cannot design', () => {
    const bad = { ...DEFAULT_SETTINGS, voiceDesign: { instruct: 'male, squeaky', seed: 1 } };
    expect(AppSettings.safeParse(bad).success).toBe(false);
  });

  it('quiet hours work the same wherever they are asked (notifications and speech share them)', () => {
    expect(inQuietHours('22:00', { start: '21:30', end: '06:30' })).toBe(true);
    expect(inQuietHours('12:00', { start: '21:30', end: '06:30' })).toBe(false);
  });
});

describe('what Atlas says', () => {
  it('has a fixed line for each moment, none gushing', () => {
    for (const line of ALL_FIXED_LINES) {
      expect(line).not.toMatch(/!/);
      expect(line.length).toBeLessThan(80);
    }
    expect(new Set(ALL_FIXED_LINES).size).toBe(ALL_FIXED_LINES.length);
  });

  it('builds the dynamic lines the plan shows', () => {
    expect(nextUpLine('Spanish practice', 20)).toBe('Next up: Spanish practice, 20 minutes.');
    expect(briefingLine(8, 6)).toBe("Good morning. 6 on today's list.");
    expect(briefingLine(14, 1)).toBe("Good afternoon. One thing on today's list.");
    expect(briefingLine(19, 0)).toBe('Good evening. Nothing is due today.');
    expect(focusStartLine(25)).toBe('Focus session started. 25 minutes.');
  });

  it('rotates the completion line', () => {
    const seen = new Set(Array.from({ length: 5 }, (_, i) => completionLine(i)));
    expect(seen.size).toBe(FIXED_LINES.completion.length);
  });
});

describe('the audio cache', () => {
  it('keys by voice and text: a new voice never plays an old clip', () => {
    expect(cacheKey('a', 'hello')).toBe(cacheKey('a', 'hello'));
    expect(cacheKey('a', 'hello')).not.toBe(cacheKey('b', 'hello'));
    expect(cacheKey('a', 'hello')).not.toBe(cacheKey('a', 'hello!'));
    expect(cacheKey('a', 'x')).toMatch(/^[0-9a-f]{64}$/);
  });

  it('stores and returns a clip, with its type', () => {
    const cache = createAudioCache(join(dir, 'audio-cache'));
    const key = cacheKey('v', 'line');
    expect(cache.has(key)).toBe(false);
    cache.put(key, WAV, 'audio/wav');
    expect(cache.has(key)).toBe(true);
    expect(cache.get(key)).toEqual({ bytes: WAV, mime: 'audio/wav' });
    expect(readdirSync(join(dir, 'audio-cache')).some((f) => f.endsWith('.tmp'))).toBe(false);
  });

  it('prunes the oldest clips first', () => {
    const folder = join(dir, 'audio-cache');
    const cache = createAudioCache(folder);
    for (const [i, text] of ['a', 'b', 'c'].entries()) {
      const key = cacheKey('v', text);
      cache.put(key, new Uint8Array(1000), 'audio/wav');
      const old = new Date(Date.now() - (3 - i) * 60_000);
      utimesSync(join(folder, `${key}.wav`), old, old);
    }
    expect(cache.prune(2500)).toBe(1);
    expect(cache.has(cacheKey('v', 'a'))).toBe(false);
    expect(cache.has(cacheKey('v', 'c'))).toBe(true);
    expect(statSync(folder).isDirectory()).toBe(true);
  });
});

describe('the VoiceStudio client (shapes from docs/VOICESTUDIO.md)', () => {
  const reply = (body: BodyInit, init: ResponseInit = {}) => new Response(body, init);

  it('asks for speech with the documented JSON fields and the design, and gets bytes', async () => {
    let seen: { url: string; body: Record<string, unknown>; headers: Headers } | null = null;
    const backend = createVoiceStudioBackend({
      fetch: (async (url: string, init: RequestInit) => {
        seen = { url, body: JSON.parse(String(init.body)), headers: new Headers(init.headers) };
        return reply(WAV, { headers: { 'content-type': 'audio/wav' } });
      }) as unknown as typeof fetch,
    });
    const clip = await backend.synthesize('Hello there.', DEFAULT_VOICE);
    expect(seen!.url).toBe('http://127.0.0.1:3900/v1/audio/speech');
    expect(seen!.headers.get('content-type')).toBe('application/json');
    expect(seen!.body).toEqual({
      model: 'omnivoice',
      input: 'Hello there.',
      voice: 'default',
      response_format: 'wav',
      language: 'en',
      instruct: DEFAULT_VOICE.instruct,
      seed: DEFAULT_VOICE.seed,
    });
    expect(clip).toEqual({ bytes: WAV, mime: 'audio/wav' });
  });

  it('never sends more than the 4096 characters the API takes', async () => {
    let input = '';
    const backend = createVoiceStudioBackend({
      fetch: (async (_u: string, init: RequestInit) => {
        input = (JSON.parse(String(init.body)) as { input: string }).input;
        return reply(WAV, { headers: { 'content-type': 'audio/wav' } });
      }) as unknown as typeof fetch,
    });
    await backend.synthesize('x'.repeat(5000), DEFAULT_VOICE);
    expect(input).toHaveLength(4096);
  });

  it('calls an unreachable VoiceStudio "down", and a refusal a request error', async () => {
    const down = createVoiceStudioBackend({
      fetch: (async () => {
        throw new TypeError('fetch failed');
      }) as unknown as typeof fetch,
    });
    await expect(down.synthesize('x', DEFAULT_VOICE)).rejects.toBeInstanceOf(VoiceDownError);
    expect(await down.health()).toBe(false);

    const refuses = createVoiceStudioBackend({
      fetch: (async () => reply('{"detail":"bad"}', { status: 422 })) as unknown as typeof fetch,
    });
    await expect(refuses.synthesize('x', DEFAULT_VOICE)).rejects.toBeInstanceOf(VoiceRequestError);
  });

  it('does not treat JSON or a tiny body as audio', async () => {
    const json = createVoiceStudioBackend({
      fetch: (async () =>
        reply('{"a":1}', {
          headers: { 'content-type': 'application/json' },
        })) as unknown as typeof fetch,
    });
    await expect(json.synthesize('x', DEFAULT_VOICE)).rejects.toThrow(/not audio/);
    const tiny = createVoiceStudioBackend({
      fetch: (async () =>
        reply(new Uint8Array(3), {
          headers: { 'content-type': 'audio/wav' },
        })) as unknown as typeof fetch,
    });
    await expect(tiny.synthesize('x', DEFAULT_VOICE)).rejects.toThrow(/empty/);
  });

  it('transcribes with a multipart upload and reads { text }', async () => {
    let form: FormData | null = null;
    const backend = createVoiceStudioBackend({
      fetch: (async (url: string, init: RequestInit) => {
        expect(url).toBe('http://127.0.0.1:3900/v1/audio/transcriptions');
        form = init.body as FormData;
        return reply(JSON.stringify({ text: ' add a task ' }), {
          headers: { 'content-type': 'application/json' },
        });
      }) as unknown as typeof fetch,
    });
    expect(await backend.transcribe(WAV, 'audio/webm')).toBe('add a task');
    expect(form!.get('model')).toBe('whisper-1');
    expect((form!.get('file') as File).name).toBe('speech.webm');
  });
});

describe('the voice service', () => {
  const fakeBackend = (over: Partial<SpeechBackend> = {}): SpeechBackend & { calls: string[] } => {
    const calls: string[] = [];
    return {
      calls,
      health: async () => true,
      synthesize: async (text) => {
        calls.push(text);
        return { bytes: WAV, mime: 'audio/wav' };
      },
      transcribe: async () => 'hello',
      ...over,
    };
  };
  const make = (backend: SpeechBackend, design = DEFAULT_VOICE, clock = { t: 0 }) =>
    createVoiceService({
      backend,
      cache: createAudioCache(join(dir, 'audio-cache')),
      design: () => design,
      now: () => clock.t,
    });

  it('plays a line from the cache the second time, without calling VoiceStudio', async () => {
    const backend = fakeBackend();
    const voice = make(backend);
    const first = await voice.speak('Good morning.');
    const second = await voice.speak('Good morning.');
    expect(first).toMatchObject({ ok: true, cached: false });
    expect(second).toMatchObject({ ok: true, cached: true });
    expect(backend.calls).toEqual(['Good morning.']);
  });

  it('a new voice renders again instead of playing the old voice', async () => {
    const backend = fakeBackend();
    let design = DEFAULT_VOICE;
    const voice = createVoiceService({
      backend,
      cache: createAudioCache(join(dir, 'audio-cache')),
      design: () => design,
    });
    await voice.speak('Hello.');
    design = VOICE_CANDIDATES[1]!.design;
    await voice.speak('Hello.');
    expect(backend.calls).toEqual(['Hello.', 'Hello.']);
  });

  it('asks only once for the same line asked twice at the same moment', async () => {
    let release: () => void = () => undefined;
    const gate = new Promise<void>((r) => (release = r));
    const backend = fakeBackend({
      synthesize: async (text) => {
        backend.calls.push(text);
        await gate;
        return { bytes: WAV, mime: 'audio/wav' };
      },
    });
    const voice = make(backend);
    const a = voice.speak('Same.');
    const b = voice.speak('Same.');
    release();
    expect((await a).ok && (await b).ok).toBe(true);
    expect(backend.calls).toEqual(['Same.']);
  });

  it('with VoiceStudio gone it answers "down" quietly, and stops retrying for a while', async () => {
    const clock = { t: 1000 };
    const backend = fakeBackend({
      synthesize: async (text) => {
        backend.calls.push(text);
        throw new VoiceDownError('refused');
      },
    });
    const voice = make(backend, DEFAULT_VOICE, clock);
    expect(await voice.speak('One.')).toMatchObject({ ok: false, reason: 'down' });
    expect(await voice.speak('Two.')).toMatchObject({ ok: false, reason: 'down' });
    expect(backend.calls).toEqual(['One.']); // the second never touched the network
    clock.t += 16_000;
    await voice.speak('Three.');
    expect(backend.calls).toEqual(['One.', 'Three.']);
  });

  it('still plays cached lines when VoiceStudio is down', async () => {
    const backend = fakeBackend();
    const voice = make(backend);
    await voice.speak('Cached.');
    backend.synthesize = async () => {
      throw new VoiceDownError('gone');
    };
    expect(await voice.speak('Cached.')).toMatchObject({ ok: true, cached: true });
  });

  it('treats a refusal as an error, not as down', async () => {
    const voice = make(
      fakeBackend({
        synthesize: async () => {
          throw new VoiceRequestError('no engine', 400);
        },
      }),
    );
    expect(await voice.speak('x')).toMatchObject({ ok: false, reason: 'error' });
  });

  it('renders the fixed lines ahead of time, once, and reports how many are ready', async () => {
    const backend = fakeBackend();
    const voice = make(backend);
    expect((await voice.status()).fixedCached).toBe(0);
    const first = await voice.prerender();
    expect(first.rendered).toBe(ALL_FIXED_LINES.length);
    expect(await voice.status()).toMatchObject({
      backend: 'up',
      fixedCached: ALL_FIXED_LINES.length,
    });
    const again = await voice.prerender();
    expect(again).toMatchObject({ rendered: 0, skipped: ALL_FIXED_LINES.length });
    expect(backend.calls).toHaveLength(ALL_FIXED_LINES.length);
  });

  it('stops pre-rendering as soon as VoiceStudio is gone', async () => {
    let n = 0;
    const backend = fakeBackend({
      synthesize: async () => {
        if (++n > 2) throw new VoiceDownError('gone');
        return { bytes: WAV, mime: 'audio/wav' };
      },
    });
    const result = await make(backend).prerender();
    expect(result.rendered).toBe(2);
    expect(n).toBe(3);
  });

  it('reports "down" in status when the health check fails, and transcribes through the backend', async () => {
    const down = make(fakeBackend({ health: async () => false }));
    expect((await down.status()).backend).toBe('down');
    expect(await make(fakeBackend()).transcribe(WAV, 'audio/webm')).toEqual({
      ok: true,
      text: 'hello',
    });
    const gone = make(
      fakeBackend({
        transcribe: async () => {
          throw new VoiceDownError('gone');
        },
      }),
    );
    expect(await gone.transcribe(WAV, 'audio/webm')).toMatchObject({ ok: false, reason: 'down' });
  });

  it('refuses to speak nothing', async () => {
    expect(await make(fakeBackend()).speak('   ')).toMatchObject({ ok: false });
  });
});
