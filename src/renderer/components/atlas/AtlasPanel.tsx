import { useCallback, useEffect, useRef, useState } from 'react';
import type { AtlasChangeView, ChatLineView } from '@shared/atlas-modes';
import { errorMessage, useLive } from '@/hooks/useLive';
import { ErrorNote, buttonPrimary, buttonQuiet, inputClass } from '@/components/ui';
import { createRecorder } from '@/lib/recorder';
import { SentenceChunker } from '@/lib/sentences';
import { speaker, useFallbackBadge, useSpeaking } from '@/lib/voice';
import { voiceBus } from '@/lib/voice-bus';

interface Props {
  onClose(): void;
  onSettings(): void;
  onBrainDump(): void;
  onPlan(): void;
}

/** The Atlas drawer: chat, the day's Atlas changes with Undo, and the modes. */
export function AtlasPanel({ onClose, onSettings, onBrainDump, onPlan }: Props) {
  const [lines, setLines] = useState<ChatLineView[]>([]);
  const [draft, setDraft] = useState('');
  const [sending, setSending] = useState(false);
  const [streaming, setStreaming] = useState('');
  const [error, setError] = useState<{ text: string; setup: boolean } | null>(null);
  const end = useRef<HTMLDivElement>(null);

  // Speaking and listening (PLAN §8). Everything here stays out of the way unless speech is on.
  const loadSettings = useCallback(() => window.cortex.settings.get(), []);
  const voiceSettings = useLive(loadSettings).data?.settings;
  const voiceOn = voiceSettings?.voiceEnabled ?? false;
  const autoSend = voiceSettings?.voiceAutoSend ?? false;
  const fallbackBadge = useFallbackBadge();
  const speaking = useSpeaking();
  const [micUp, setMicUp] = useState<boolean | null>(null);
  const [recording, setRecording] = useState(false);
  const [transcribing, setTranscribing] = useState(false);
  const chunker = useRef(new SentenceChunker());
  const streamingRef = useRef(false);
  const recorder = useRef(createRecorder());
  const hold = useRef(false);
  const toggleRef = useRef<() => void>(() => undefined);

  const loadStatus = useCallback(() => window.cortex.atlas.status(), []);
  const loadChanges = useCallback(() => window.cortex.atlas.changes(), []);
  const { data: status } = useLive(loadStatus);
  const { data: changes } = useLive(loadChanges);
  const noKey = status !== null && !status.hasKey;

  useEffect(() => {
    void window.cortex.atlas.history().then(setLines);
    return window.cortex.atlas.onChunk((piece) => {
      setStreaming((s) => s + piece);
      // Each sentence is spoken as soon as it is complete, while the rest is still being written.
      if (streamingRef.current)
        for (const sentence of chunker.current.push(piece)) speaker.say(sentence);
    });
  }, []);

  // Is VoiceStudio there to listen? Checked while the panel is open and speech is on.
  useEffect(() => {
    if (!voiceOn) return;
    const check = () =>
      void window.cortex.voice.status().then(
        (s) => setMicUp(s.backend === 'up'),
        () => setMicUp(false),
      );
    check();
    const timer = setInterval(check, 8000);
    return () => clearInterval(timer);
  }, [voiceOn]);
  useEffect(() => {
    const rec = recorder.current;
    return () => rec.cancel();
  }, []);
  useEffect(() => {
    end.current?.scrollIntoView?.({ block: 'end' });
  }, [lines, streaming]);

  const send = (said?: string) => {
    const text = (said ?? draft).trim();
    if (!text || sending) return;
    speaker.stop();
    chunker.current = new SentenceChunker();
    streamingRef.current = true;
    setDraft('');
    setError(null);
    setStreaming('');
    setSending(true);
    setLines((l) => [...l, { role: 'user', text }]);
    window.cortex.atlas
      .send(text)
      .then(async (result) => {
        if (!result.ok) {
          setError({
            text: result.error,
            setup: result.kind === 'no-key' || result.kind === 'bad-key',
          });
          setLines((l) => l.slice(0, -1));
          setDraft(text);
          return;
        }
        for (const sentence of chunker.current.flush()) speaker.say(sentence);
        setLines(await window.cortex.atlas.history());
      })
      .catch((e: unknown) => setError({ text: errorMessage(e), setup: false }))
      .finally(() => {
        streamingRef.current = false;
        setSending(false);
        setStreaming('');
      });
  };

  const say = (text: string) => setError({ text, setup: false });

  async function startRecording() {
    speaker.stop();
    try {
      const s = await window.cortex.voice.status();
      setMicUp(s.backend === 'up');
      if (s.backend !== 'up') {
        say(
          'VoiceStudio is not running, so voice input is unavailable. Start it, or type instead.',
        );
        return;
      }
      setError(null);
      await recorder.current.start();
      setRecording(true);
    } catch (e) {
      say(errorMessage(e));
    }
  }

  async function stopAndTranscribe() {
    setRecording(false);
    const heard = await recorder.current.stop();
    if (!heard) return;
    setTranscribing(true);
    try {
      const result = await window.cortex.voice.transcribe(heard.audio, heard.mime);
      if (!result.ok) {
        say(
          result.reason === 'down'
            ? 'VoiceStudio is not running, so voice input is unavailable. Start it, or type instead.'
            : `Cortex could not transcribe that: ${result.message}`,
        );
      } else if (!result.text) {
        say('Nothing came through. Try again, a little closer to the microphone.');
      } else if (autoSend && !noKey) {
        send(result.text);
      } else {
        // The transcript lands in the box, to be fixed before it is sent.
        setDraft((d) => (d.trim() ? `${d.trim()} ${result.text}` : result.text));
      }
    } catch (e) {
      say(errorMessage(e));
    } finally {
      setTranscribing(false);
    }
  }

  const toggleRecording = () => {
    if (recorder.current.active) void stopAndTranscribe();
    else void startRecording();
  };
  useEffect(() => {
    toggleRef.current = toggleRecording;
  });
  // The global hotkey: press once to start, again to stop.
  useEffect(
    () =>
      voiceBus.listen(() => {
        hold.current = false;
        toggleRef.current();
      }),
    [],
  );

  const undo = (change: AtlasChangeView) => {
    window.cortex.undo
      .apply(change.id)
      .catch((e: unknown) => setError({ text: errorMessage(e), setup: false }));
  };

  return (
    <aside
      aria-label="Atlas"
      className="flex h-full w-[26rem] shrink-0 flex-col border-l border-line bg-surface"
    >
      <header className="flex items-center justify-between border-b border-line px-4 py-3">
        <h2 className="text-lg font-semibold">Atlas</h2>
        <span className="flex items-center gap-2">
          {voiceOn && fallbackBadge && (
            <span
              data-testid="fallback-badge"
              title="VoiceStudio is not running, so Atlas is using this computer's own voice"
              className="rounded-full border border-line px-2 py-0.5 text-xs text-ink-muted"
            >
              fallback voice
            </span>
          )}
          {speaking && (
            <button className={buttonQuiet} onClick={() => speaker.stop()}>
              Stop speaking
            </button>
          )}
          <button className={buttonQuiet} onClick={onClose} aria-label="Close Atlas">
            Close
          </button>
        </span>
      </header>

      <div className="flex gap-2 border-b border-line px-4 py-2">
        <button className={buttonQuiet} onClick={onPlan} disabled={noKey}>
          Plan the rest of today
        </button>
        <button className={buttonQuiet} onClick={onBrainDump} disabled={noKey}>
          Brain dump
        </button>
      </div>

      <div className="flex-1 space-y-3 overflow-y-auto px-4 py-3" data-testid="atlas-transcript">
        {noKey && (
          <div className="rounded-card border border-dashed border-line p-4 text-sm">
            <p className="font-medium">Atlas needs your Anthropic API key.</p>
            <p className="mt-1 text-ink-muted">
              Add it once in Settings. Everything else in Cortex works without it.
            </p>
            <button className={`${buttonQuiet} mt-3`} onClick={onSettings}>
              Open Settings
            </button>
          </div>
        )}
        {!noKey && lines.length === 0 && !sending && (
          <p className="text-sm text-ink-muted">
            Ask for what you need: &ldquo;Add grade lab reports to Chemistry for Friday&rdquo;, or
            &ldquo;What&rsquo;s on for today?&rdquo;
          </p>
        )}
        {lines.map((line, i) => (
          <p
            key={i}
            data-role={line.role}
            className={`whitespace-pre-wrap rounded-lg px-3 py-2 text-sm ${
              line.role === 'user' ? 'ml-8 bg-raised' : 'mr-8 border border-line'
            }`}
          >
            {line.text}
          </p>
        ))}
        {sending && (
          <p
            data-role="assistant"
            className="mr-8 whitespace-pre-wrap rounded-lg border border-line px-3 py-2 text-sm"
          >
            {streaming || 'Thinking…'}
          </p>
        )}
        <div ref={end} />
      </div>

      {error && (
        <div className="px-4">
          <ErrorNote message={error.text} />
          {error.setup && (
            <button className={`${buttonQuiet} mb-3`} onClick={onSettings}>
              Open Settings
            </button>
          )}
        </div>
      )}

      {changes && changes.length > 0 && (
        <details className="border-t border-line px-4 py-2 text-sm" open>
          <summary className="cursor-pointer font-medium">
            Atlas changed today ({changes.filter((c) => !c.undone).length})
          </summary>
          <ul className="mt-2 max-h-40 space-y-1 overflow-y-auto" data-testid="atlas-changes">
            {changes.map((c) => (
              <li key={c.id} className="flex items-center justify-between gap-2">
                <span className={c.undone ? 'text-ink-muted line-through' : ''}>{c.summary}</span>
                {!c.undone && (
                  <button
                    className="shrink-0 text-accent-soft hover:underline"
                    aria-label={`Undo ${c.summary}`}
                    onClick={() => undo(c)}
                  >
                    Undo
                  </button>
                )}
              </li>
            ))}
          </ul>
        </details>
      )}

      <form
        className="flex gap-2 border-t border-line p-3"
        onSubmit={(e) => {
          e.preventDefault();
          send();
        }}
      >
        <textarea
          aria-label="Message Atlas"
          rows={2}
          className={`${inputClass} resize-none`}
          placeholder={
            noKey
              ? 'Add your API key in Settings first'
              : recording
                ? 'Listening…'
                : 'Message Atlas'
          }
          value={draft}
          disabled={noKey}
          onChange={(e) => setDraft(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter' && !e.shiftKey) {
              e.preventDefault();
              send();
            }
          }}
        />
        {voiceOn && (
          <button
            type="button"
            data-testid="mic"
            aria-label="Hold to talk"
            aria-pressed={recording}
            disabled={micUp === false || transcribing}
            title={
              micUp === false
                ? 'Voice input needs VoiceStudio, which is not running'
                : 'Hold to talk, or press the voice hotkey to start and stop'
            }
            className={`${buttonQuiet} shrink-0 ${recording ? 'border-brand-violet text-ink glow-violet' : ''}`}
            onPointerDown={(e) => {
              e.preventDefault();
              hold.current = true;
              void startRecording();
            }}
            onPointerUp={() => {
              if (hold.current && recorder.current.active) {
                hold.current = false;
                void stopAndTranscribe();
              }
            }}
            onPointerLeave={() => {
              if (hold.current && recorder.current.active) {
                hold.current = false;
                void stopAndTranscribe();
              }
            }}
            onKeyDown={(e) => {
              if (e.key === ' ' || e.key === 'Enter') {
                e.preventDefault();
                toggleRecording();
              }
            }}
          >
            {recording ? 'Listening' : transcribing ? 'Hearing' : 'Mic'}
          </button>
        )}
        <button
          type="submit"
          className={buttonPrimary}
          disabled={sending || noKey || !draft.trim()}
        >
          Send
        </button>
      </form>
    </aside>
  );
}
