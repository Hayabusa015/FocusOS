import { useCallback, useEffect, useState } from 'react';
import type { AppSettingsPatch } from '@shared/core';
import { SPEAKING_EVENTS, SPEAKING_EVENT_LABELS, VOICE_CANDIDATES, voiceId } from '@shared/voice';
import type { VoiceStatusView } from '@shared/voice';
import { errorMessage, useLive } from '@/hooks/useLive';
import { previewVoice } from '@/lib/voice';
import { acceleratorFrom } from './CoreSettings';
import { Card, ErrorNote, Switch, buttonQuiet, inputClass } from './ui';

const SAMPLE = 'Good evening. Four things left today, and the lab reports are the big one.';

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="flex items-center justify-between gap-6 border-b border-line py-3 text-sm last:border-0">
      <span className="text-ink-muted">{label}</span>
      {children}
    </label>
  );
}

/** Settings → Voice: whether Atlas speaks, which voice, what it says on its own, and the hotkey. */
export function VoiceSettings() {
  const load = useCallback(() => window.cortex.settings.get(), []);
  const { data: info, error } = useLive(load);
  const [status, setStatus] = useState<VoiceStatusView | null>(null);
  const [problem, setProblem] = useState<string | null>(null);
  const [playing, setPlaying] = useState<string | null>(null);
  const [recording, setRecording] = useState(false);
  const [preparing, setPreparing] = useState(false);
  const [volume, setVolume] = useState<number | null>(null);
  const s = info?.settings;

  const refreshStatus = useCallback(() => {
    void window.cortex.voice.status().then(setStatus, () => setStatus(null));
  }, []);
  useEffect(() => {
    refreshStatus();
    const timer = setInterval(refreshStatus, 8000);
    return () => clearInterval(timer);
  }, [refreshStatus]);

  // The count of ready lines belongs to the chosen voice, so check again when the voice changes.
  const design = s?.voiceDesign;
  useEffect(() => {
    if (design) refreshStatus();
  }, [design?.instruct, design?.seed, design, refreshStatus]);

  const update = (patch: AppSettingsPatch) => {
    setProblem(null);
    window.cortex.settings.update(patch).catch((e: unknown) => setProblem(errorMessage(e)));
  };

  const preview = async (id: string, design: { instruct: string; seed: number }) => {
    setProblem(null);
    setPlaying(id);
    const result = await previewVoice(SAMPLE, design, s?.voiceVolume ?? 0.8);
    setPlaying(null);
    if (!result.ok) setProblem(result.message);
  };

  const prepare = () => {
    setPreparing(true);
    setProblem(null);
    window.cortex.voice
      .prerender()
      .then((r) => {
        refreshStatus();
        if (r.failed > 0) setProblem('Some lines could not be prepared. Is VoiceStudio running?');
      })
      .catch((e: unknown) => setProblem(errorMessage(e)))
      .finally(() => setPreparing(false));
  };

  const up = status?.backend === 'up';
  return (
    <Card label="Voice" className="mb-6">
      <h2 className="mb-2 text-lg font-semibold">Voice</h2>
      <ErrorNote message={error ?? problem} />
      {s && (
        <>
          <p className="mb-3 text-sm" data-testid="voice-status">
            <span
              aria-hidden
              className={`mr-2 inline-block size-2 rounded-full ${up ? 'bg-win' : 'bg-caution'}`}
            />
            {status === null
              ? 'Checking VoiceStudio…'
              : up
                ? 'VoiceStudio is running. Atlas will use the voice below.'
                : "VoiceStudio is not running. Atlas will use this computer's own voice until it is."}
          </p>

          <Field label="Atlas speaks">
            <Switch
              label="Atlas speaks"
              checked={s.voiceEnabled}
              onChange={(next) => update({ voiceEnabled: next })}
            />
          </Field>
          <Field label="Volume">
            <input
              type="range"
              aria-label="Volume"
              min={0}
              max={1}
              step={0.05}
              value={volume ?? s.voiceVolume}
              onChange={(e) => setVolume(Number(e.target.value))}
              onPointerUp={() => volume !== null && update({ voiceVolume: volume })}
              onKeyUp={() => volume !== null && update({ voiceVolume: volume })}
              className="w-56 accent-accent"
            />
          </Field>
          <p className="py-2 text-xs text-ink-muted">
            Atlas stays silent during your quiet hours ({s.quietStart} to {s.quietEnd}), set under
            Your day.
          </p>

          <p className="mt-3 text-sm font-medium">What Atlas says on its own</p>
          {SPEAKING_EVENTS.map((event) => (
            <Field key={event} label={SPEAKING_EVENT_LABELS[event]}>
              <Switch
                label={SPEAKING_EVENT_LABELS[event]}
                checked={s.voiceEvents[event]}
                onChange={(next) => update({ voiceEvents: { ...s.voiceEvents, [event]: next } })}
              />
            </Field>
          ))}

          <p className="mt-4 text-sm font-medium">Talking to Atlas</p>
          <Field label="Record from anywhere (press once to start, again to stop)">
            <input
              readOnly
              data-testid="voice-hotkey"
              aria-label="Voice shortcut"
              className={`${inputClass} w-56! text-center`}
              value={recording ? 'Press the new shortcut…' : s.voiceHotkey}
              onFocus={() => setRecording(true)}
              onBlur={() => setRecording(false)}
              onKeyDown={(e) => {
                if (e.key === 'Escape') return e.currentTarget.blur();
                e.preventDefault();
                const accelerator = acceleratorFrom(e);
                if (accelerator) {
                  update({ voiceHotkey: accelerator });
                  e.currentTarget.blur();
                }
              }}
            />
          </Field>
          <Field label="Send what I say as soon as it is transcribed">
            <Switch
              label="Send what I say as soon as it is transcribed"
              checked={s.voiceAutoSend}
              onChange={(next) => update({ voiceAutoSend: next })}
            />
          </Field>

          <p className="mt-4 text-sm font-medium">Atlas&apos;s voice</p>
          <p className="mb-2 text-xs text-ink-muted">
            Each is designed from a description, never cloned from anyone. Listen, then pick by ear.
          </p>
          <ul className="divide-y divide-line border-y border-line" data-testid="voice-candidates">
            {VOICE_CANDIDATES.map((c) => {
              const current = voiceId(c.design) === voiceId(s.voiceDesign);
              return (
                <li key={c.id} className="flex items-center justify-between gap-3 py-2">
                  <span className="min-w-0">
                    <span className="block text-sm font-medium">{c.label}</span>
                    <span className="block truncate text-xs text-ink-muted">
                      {c.design.instruct}
                    </span>
                  </span>
                  <span className="flex shrink-0 gap-2">
                    <button
                      className={buttonQuiet}
                      disabled={playing !== null || !up}
                      title={up ? undefined : 'Needs VoiceStudio running'}
                      onClick={() => void preview(c.id, c.design)}
                    >
                      {playing === c.id ? 'Playing…' : 'Preview'}
                    </button>
                    {current ? (
                      <span className="grid place-items-center px-2 text-xs text-accent-soft">
                        In use
                      </span>
                    ) : (
                      <button
                        className={buttonQuiet}
                        onClick={() => update({ voiceDesign: c.design })}
                      >
                        Use this voice
                      </button>
                    )}
                  </span>
                </li>
              );
            })}
          </ul>

          <div className="mt-3 flex items-center justify-between gap-3 text-sm">
            <span className="text-ink-muted" data-testid="voice-fixed">
              {status
                ? `${status.fixedCached} of ${status.fixedTotal} everyday lines ready to play instantly`
                : ''}
            </span>
            <button className={buttonQuiet} disabled={!up || preparing} onClick={prepare}>
              {preparing ? 'Preparing…' : 'Prepare lines'}
            </button>
          </div>
        </>
      )}
    </Card>
  );
}
