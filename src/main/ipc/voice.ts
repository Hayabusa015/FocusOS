import { CHANNELS } from '@shared/channels';
import { VoicePreviewInput, VoiceSpeakInput, VoiceTranscribeInput } from '@shared/voice';
import type { VoiceClip } from '@shared/voice';
import { EmptyRequest as Empty } from '@shared/schemas';
import type { VoiceService } from '../voice/service';
import { handle } from './handle';
import type { TrustCheck } from './handle';

/** Registers the voice channels. Every payload is validated before the handler sees it. */
export function registerVoiceIpc(deps: { voice: VoiceService; isTrustedSender: TrustCheck }): void {
  const { voice, isTrustedSender: trust } = deps;
  const clip = (r: Awaited<ReturnType<VoiceService['speak']>>): VoiceClip =>
    r.ok ? { ok: true, audio: r.bytes, mime: r.mime, cached: r.cached, ms: r.ms } : r;

  handle(CHANNELS.voiceStatus, Empty, () => voice.status(), trust);
  handle(
    CHANNELS.voiceSpeak,
    VoiceSpeakInput,
    async ({ text }) => clip(await voice.speak(text)),
    trust,
  );
  handle(
    CHANNELS.voicePreview,
    VoicePreviewInput,
    async ({ text, design }) => clip(await voice.preview(text, design)),
    trust,
  );
  handle(
    CHANNELS.voiceTranscribe,
    VoiceTranscribeInput,
    ({ audio, mime }) => voice.transcribe(audio, mime),
    trust,
  );
  handle(CHANNELS.voicePrerender, Empty, () => voice.prerender(), trust);
}
