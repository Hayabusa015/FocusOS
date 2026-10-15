/**
 * Push-to-talk recording (PLAN §8.4): MediaRecorder captures WebM/Opus, which goes to VoiceStudio
 * for transcription. Nothing is recorded unless `start` is called, and the microphone is released
 * the moment `stop` returns.
 */
export interface Recording {
  audio: Uint8Array;
  mime: string;
}

export interface Recorder {
  readonly active: boolean;
  start(): Promise<void>;
  /** Stops and returns what was said, or null if nothing usable was recorded. */
  stop(): Promise<Recording | null>;
  /** Stops and throws the recording away. */
  cancel(): void;
}

const MIME = 'audio/webm;codecs=opus';

export function createRecorder(): Recorder {
  let media: MediaRecorder | null = null;
  let stream: MediaStream | null = null;
  let chunks: Blob[] = [];

  const release = () => {
    stream?.getTracks().forEach((t) => t.stop());
    stream = null;
    media = null;
  };

  return {
    get active() {
      return media !== null && media.state === 'recording';
    },

    async start() {
      if (media) return;
      try {
        stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      } catch {
        throw new Error(
          'Cortex could not use the microphone. Check that one is connected and allowed.',
        );
      }
      chunks = [];
      media = new MediaRecorder(
        stream,
        MediaRecorder.isTypeSupported(MIME) ? { mimeType: MIME } : undefined,
      );
      media.ondataavailable = (e) => {
        if (e.data.size > 0) chunks.push(e.data);
      };
      media.start();
    },

    stop() {
      const m = media;
      if (!m) return Promise.resolve(null);
      return new Promise((resolve) => {
        m.onstop = async () => {
          const blob = new Blob(chunks, { type: m.mimeType || MIME });
          chunks = [];
          release();
          resolve(
            blob.size > 800
              ? { audio: new Uint8Array(await blob.arrayBuffer()), mime: blob.type || MIME }
              : null,
          );
        };
        if (m.state === 'recording') m.stop();
        else m.onstop?.(new Event('stop'));
      });
    },

    cancel() {
      if (media && media.state === 'recording') {
        media.onstop = null;
        media.stop();
      }
      chunks = [];
      release();
    },
  };
}
