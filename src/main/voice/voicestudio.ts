import type { VoiceDesign } from '@shared/voice';

/**
 * The only code that talks to VoiceStudio (docs/VOICESTUDIO.md). Everything else in Cortex sees
 * this interface, so tests use a fake and the rest of the app runs with VoiceStudio absent.
 */
export interface SpeechBackend {
  /** True when VoiceStudio answers. Never throws. */
  health(): Promise<boolean>;
  synthesize(text: string, design: VoiceDesign): Promise<{ bytes: Uint8Array; mime: string }>;
  transcribe(bytes: Uint8Array, mime: string): Promise<string>;
}

/** VoiceStudio could not be reached: not running, or not answering. Cortex falls back quietly. */
export class VoiceDownError extends Error {
  constructor(detail: string) {
    super(`VoiceStudio is not reachable (${detail})`);
    this.name = 'VoiceDownError';
  }
}

/** VoiceStudio answered, but not with what was asked for. */
export class VoiceRequestError extends Error {
  constructor(
    message: string,
    readonly status: number,
  ) {
    super(message);
    this.name = 'VoiceRequestError';
  }
}

export const DEFAULT_VOICESTUDIO_URL = 'http://127.0.0.1:3900';
const MAX_INPUT = 4096;

export interface BackendOptions {
  baseUrl?: string;
  fetch?: typeof fetch;
  /** How long a speech request may take before it counts as down. */
  speechTimeoutMs?: number;
}

export function createVoiceStudioBackend(options: BackendOptions = {}): SpeechBackend {
  const base = (options.baseUrl ?? DEFAULT_VOICESTUDIO_URL).replace(/\/$/, '');
  const doFetch = options.fetch ?? fetch;
  const speechTimeout = options.speechTimeoutMs ?? 30_000;

  async function call(path: string, init: RequestInit, timeoutMs: number): Promise<Response> {
    try {
      return await doFetch(`${base}${path}`, { ...init, signal: AbortSignal.timeout(timeoutMs) });
    } catch (error) {
      // A refused connection or a timeout: the service is not there.
      throw new VoiceDownError(error instanceof Error ? error.message : 'no answer');
    }
  }

  async function failure(res: Response, what: string): Promise<never> {
    let detail = '';
    try {
      detail = (await res.text()).slice(0, 200);
    } catch {
      // No body.
    }
    throw new VoiceRequestError(
      `VoiceStudio refused the ${what} (${res.status}) ${detail}`.trim(),
      res.status,
    );
  }

  return {
    async health() {
      try {
        const res = await doFetch(`${base}/health`, { signal: AbortSignal.timeout(1500) });
        return res.ok;
      } catch {
        return false;
      }
    },

    async synthesize(text, design) {
      const input = text.trim().slice(0, MAX_INPUT);
      const res = await call(
        '/v1/audio/speech',
        {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({
            model: 'omnivoice',
            input,
            voice: 'default',
            response_format: 'wav',
            language: 'en',
            instruct: design.instruct,
            seed: design.seed,
          }),
        },
        speechTimeout,
      );
      if (!res.ok) return failure(res, 'speech request');
      const mime =
        (res.headers.get('content-type') ?? 'audio/wav').split(';')[0]?.trim() ?? 'audio/wav';
      const bytes = new Uint8Array(await res.arrayBuffer());
      // The response is audio, not JSON. Anything that is not audio is not something to play.
      if (!/^audio\//.test(mime) && mime !== 'application/octet-stream') {
        throw new VoiceRequestError(`VoiceStudio answered with ${mime}, not audio`, res.status);
      }
      if (bytes.length < 64)
        throw new VoiceRequestError('VoiceStudio returned an empty clip', res.status);
      return { bytes, mime: mime === 'application/octet-stream' ? 'audio/wav' : mime };
    },

    async transcribe(bytes, mime) {
      const form = new FormData();
      form.append(
        'file',
        new Blob([bytes as BlobPart], { type: mime }),
        mime.includes('webm') ? 'speech.webm' : 'speech.wav',
      );
      form.append('model', 'whisper-1');
      form.append('language', 'en');
      const res = await call('/v1/audio/transcriptions', { method: 'POST', body: form }, 60_000);
      if (!res.ok) return failure(res, 'transcription');
      const body = (await res.json().catch(() => null)) as { text?: unknown } | null;
      return typeof body?.text === 'string' ? body.text.trim() : '';
    },
  };
}
