import { useCallback, useState } from 'react';
import type { AppSettingsPatch } from '@shared/core';
import type { GoogleOutcome } from '@shared/google';
import { errorMessage, useLive } from '@/hooks/useLive';
import { formatWhen } from '@/lib/format';
import { Card, ErrorNote, Switch, buttonPrimary, buttonQuiet, inputClass } from './ui';

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="flex items-center justify-between gap-6 border-b border-line py-3 text-sm last:border-0">
      <span className="text-ink-muted">{label}</span>
      {children}
    </label>
  );
}

/**
 * Settings → Google: sign in once with your own Google project (docs/GOOGLE_SETUP.md), choose which
 * calendars to show, and switch email suggestions on or off. Nothing here is needed to use Cortex.
 */
export function GoogleSettings() {
  const loadStatus = useCallback(() => window.cortex.google.status(), []);
  const loadSettings = useCallback(() => window.cortex.settings.get(), []);
  const { data: status, error } = useLive(loadStatus);
  const { data: info } = useLive(loadSettings);
  const [clientId, setClientId] = useState('');
  const [clientSecret, setClientSecret] = useState('');
  const [busy, setBusy] = useState<'sign-in' | 'sync' | 'email' | null>(null);
  const [problem, setProblem] = useState<string | null>(null);
  const [note, setNote] = useState<string | null>(null);
  const [confirmOff, setConfirmOff] = useState(false);
  const s = info?.settings;

  const update = (patch: AppSettingsPatch) => {
    setProblem(null);
    window.cortex.settings.update(patch).catch((e: unknown) => setProblem(errorMessage(e)));
  };

  const run = async (kind: 'sign-in' | 'sync', fn: () => Promise<GoogleOutcome>) => {
    setBusy(kind);
    setProblem(null);
    setNote(null);
    try {
      const outcome = await fn();
      if (!outcome.ok) setProblem(outcome.error);
    } catch (e) {
      setProblem(errorMessage(e));
    } finally {
      setBusy(null);
    }
  };

  const checkEmail = async () => {
    setBusy('email');
    setProblem(null);
    setNote(null);
    try {
      const r = await window.cortex.google.checkEmail();
      if (!r.ok) setProblem(r.error);
      else
        setNote(
          r.proposed > 0
            ? `${r.proposed} new ${r.proposed === 1 ? 'suggestion is' : 'suggestions are'} waiting in your Inbox.`
            : 'Nothing new needs a task.',
        );
    } catch (e) {
      setProblem(errorMessage(e));
    } finally {
      setBusy(null);
    }
  };

  const toggleCalendar = (id: string, on: boolean) => {
    if (!status) return;
    const chosen = status.calendars.filter((c) => c.selected && !c.isCortex).map((c) => c.id);
    void run('sync', () =>
      window.cortex.google.setCalendars(on ? [...chosen, id] : chosen.filter((x) => x !== id)),
    );
  };

  return (
    <Card label="Google" className="mb-6">
      <h2 className="mb-2 text-lg font-semibold">Google</h2>
      <ErrorNote message={error ?? problem} />
      {note && (
        <p role="status" className="mb-3 text-sm text-ink-muted" data-testid="google-note">
          {note}
        </p>
      )}
      {status && (
        <>
          <p className="mb-3 text-sm" data-testid="google-status">
            <span
              aria-hidden
              className={`mr-2 inline-block size-2 rounded-full ${
                status.connected && !status.needsSignIn ? 'bg-win' : 'bg-ink-muted'
              }`}
            />
            {!status.connected
              ? 'Not connected. Cortex works fully without Google.'
              : status.needsSignIn
                ? 'Google needs you to sign in again.'
                : `Connected as ${status.account ?? 'your Google account'}.`}
          </p>

          {(!status.connected || status.needsSignIn) && (
            <div className="mb-2">
              {!status.connected && (
                <>
                  <p className="mb-3 text-xs text-ink-muted">
                    Use a personal Google account only, not school email. One-time setup, step by
                    step, is in docs/GOOGLE_SETUP.md. Google will warn that the app is
                    &ldquo;unverified&rdquo;. That is expected: it is your own project.
                  </p>
                  <Field label="Client ID">
                    <input
                      className={`${inputClass} w-80!`}
                      aria-label="Google client ID"
                      value={clientId}
                      onChange={(e) => setClientId(e.target.value)}
                      placeholder="…apps.googleusercontent.com"
                      autoComplete="off"
                      spellCheck={false}
                    />
                  </Field>
                  <Field label="Client secret">
                    <input
                      type="password"
                      className={`${inputClass} w-80!`}
                      aria-label="Google client secret"
                      value={clientSecret}
                      onChange={(e) => setClientSecret(e.target.value)}
                      placeholder="GOCSPX-…"
                      autoComplete="off"
                      spellCheck={false}
                    />
                  </Field>
                </>
              )}
              <div className="mt-3 flex items-center gap-3">
                <button
                  className={buttonPrimary}
                  data-testid="google-connect"
                  disabled={
                    busy !== null ||
                    !status.canStoreSecrets ||
                    (!status.connected && (!clientId.trim() || !clientSecret.trim()))
                  }
                  onClick={() =>
                    void run('sign-in', async () => {
                      const outcome = status.connected
                        ? await window.cortex.google.reconnect()
                        : await window.cortex.google.connect({ clientId, clientSecret });
                      if (outcome.ok) setClientSecret('');
                      return outcome;
                    })
                  }
                >
                  {busy === 'sign-in'
                    ? 'Waiting for Google in your browser…'
                    : status.connected
                      ? 'Sign in again'
                      : 'Sign in with Google'}
                </button>
                {!status.canStoreSecrets && (
                  <span className="text-xs text-caution">
                    This PC cannot keep a sign-in safely, so Cortex will not save one.
                  </span>
                )}
              </div>
            </div>
          )}

          {status.connected && s && (
            <>
              <p className="mt-3 text-sm font-medium">Calendar</p>
              <Field label="Show events on Today, and mirror my time blocks to a calendar named Cortex">
                <Switch
                  label="Google Calendar"
                  checked={s.googleCalendar}
                  onChange={(next) => update({ googleCalendar: next })}
                />
              </Field>
              {s.googleCalendar && (
                <>
                  <ul
                    className="divide-y divide-line border-y border-line"
                    data-testid="google-calendars"
                  >
                    {status.calendars.map((c) => (
                      <li
                        key={c.id}
                        className="flex items-center justify-between gap-3 py-2 text-sm"
                      >
                        <span className="min-w-0 truncate">
                          {c.name}
                          {c.isCortex && (
                            <span className="ml-2 text-xs text-ink-muted">
                              time blocks are written here, and only here
                            </span>
                          )}
                        </span>
                        <Switch
                          label={`Show ${c.name}`}
                          checked={c.selected}
                          onChange={(next) => (c.isCortex ? undefined : toggleCalendar(c.id, next))}
                        />
                      </li>
                    ))}
                  </ul>
                  <div className="mt-3 flex items-center justify-between gap-3 text-sm">
                    <span className="text-ink-muted" data-testid="google-sync-status">
                      {status.calendar.state === 'error'
                        ? (status.calendar.error ?? 'Sync failed.')
                        : `Last synced ${formatWhen(status.calendar.lastSync)}`}
                    </span>
                    <button
                      className={buttonQuiet}
                      disabled={busy !== null}
                      onClick={() => void run('sync', () => window.cortex.google.sync())}
                    >
                      {busy === 'sync' ? 'Syncing…' : 'Sync now'}
                    </button>
                  </div>
                </>
              )}

              <p className="mt-5 text-sm font-medium">Email suggestions</p>
              <Field label="Atlas looks at new inbox mail and suggests tasks for you to accept">
                <Switch
                  label="Email suggestions"
                  checked={s.googleEmailTriage}
                  onChange={(next) => update({ googleEmailTriage: next })}
                />
              </Field>
              {s.googleEmailTriage && (
                <div className="mt-2 flex items-center justify-between gap-3 text-sm">
                  <span
                    className={status.gmail.state === 'ok' ? 'text-ink-muted' : 'text-caution'}
                    data-testid="google-gmail-status"
                  >
                    {status.gmail.state === 'unavailable'
                      ? 'Google did not allow Cortex to read Gmail, so email suggestions are off. Calendar still works.'
                      : status.gmail.state === 'error'
                        ? (status.gmail.error ?? 'The last check failed.')
                        : `Last checked ${formatWhen(status.gmail.lastRun)}`}
                  </span>
                  <button
                    className={buttonQuiet}
                    disabled={busy !== null}
                    onClick={() => void checkEmail()}
                  >
                    {busy === 'email' ? 'Checking…' : 'Check email'}
                  </button>
                </div>
              )}
              <p className="mt-2 text-xs text-ink-muted">
                Cortex reads the sender, subject, date and a short snippet of each message, never
                the body or attachments. Atlas sees only those, and nothing is added until you
                accept it. Email is never sent.
              </p>

              <div className="mt-5 flex items-center justify-between gap-3 border-t border-line pt-4 text-sm">
                <span className="text-xs text-ink-muted">
                  Disconnecting forgets the sign-in and the cached events. The Cortex calendar stays
                  in Google.
                </span>
                {confirmOff ? (
                  <span className="flex gap-2">
                    <button className={buttonQuiet} onClick={() => setConfirmOff(false)}>
                      Keep it
                    </button>
                    <button
                      className={buttonQuiet}
                      data-testid="google-disconnect-confirm"
                      onClick={() => {
                        setConfirmOff(false);
                        void window.cortex.google
                          .disconnect()
                          .catch((e: unknown) => setProblem(errorMessage(e)));
                      }}
                    >
                      Yes, disconnect
                    </button>
                  </span>
                ) : (
                  <button
                    className={buttonQuiet}
                    data-testid="google-disconnect"
                    onClick={() => setConfirmOff(true)}
                  >
                    Disconnect Google
                  </button>
                )}
              </div>
            </>
          )}
        </>
      )}
    </Card>
  );
}
