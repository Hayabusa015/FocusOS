import { useCallback, useState } from 'react';
import type { AppSettingsPatch, AreaKind } from '@shared/core';
import { errorMessage, useLive } from '@/hooks/useLive';
import { AREA_COLOR_TOKENS, areaColor } from '@/lib/areas';
import { Card, ErrorNote, Switch, buttonPrimary, buttonQuiet, inputClass } from './ui';

const KEY_NAMES: Record<string, string> = {
  ' ': 'Space',
  ArrowUp: 'Up',
  ArrowDown: 'Down',
  ArrowLeft: 'Left',
  ArrowRight: 'Right',
  Escape: 'Esc',
};

/** Builds an Electron accelerator such as `Control+Alt+N` from a key press, or null. */
export function acceleratorFrom(event: React.KeyboardEvent): string | null {
  if (['Control', 'Alt', 'Shift', 'Meta'].includes(event.key)) return null;
  const mods = [
    event.ctrlKey && 'Control',
    event.altKey && 'Alt',
    event.shiftKey && 'Shift',
    event.metaKey && 'Super',
  ].filter(Boolean) as string[];
  if (mods.length === 0) return null; // A bare key would hijack typing everywhere.
  const key =
    KEY_NAMES[event.key] ?? (event.key.length === 1 ? event.key.toUpperCase() : event.key);
  return [...mods, key].join('+');
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="flex items-center justify-between gap-6 border-b border-line py-3 text-sm last:border-0">
      <span className="text-ink-muted">{label}</span>
      {children}
    </label>
  );
}

export function CoreSettings() {
  const load = useCallback(() => window.cortex.settings.get(), []);
  const loadAreas = useCallback(() => window.cortex.areas.list(true), []);
  const { data: info, error } = useLive(load);
  const { data: areas } = useLive(loadAreas);
  const [actionError, setActionError] = useState<string | null>(null);
  const [recording, setRecording] = useState(false);
  const [newName, setNewName] = useState('');
  const [newColor, setNewColor] = useState<string>(AREA_COLOR_TOKENS[0]);
  const [newKind, setNewKind] = useState<AreaKind>('personal');

  const run = (action: () => Promise<unknown>) => {
    setActionError(null);
    action().catch((e: unknown) => setActionError(errorMessage(e)));
  };
  const update = (patch: AppSettingsPatch) => run(() => window.cortex.settings.update(patch));
  const s = info?.settings;

  return (
    <>
      <Card label="Your day" className="mb-6">
        <h2 className="mb-2 text-lg font-semibold">Your day</h2>
        <ErrorNote message={error ?? actionError} />
        {s && (
          <>
            <Field label="Day starts">
              <input
                type="time"
                className={`${inputClass} w-32!`}
                value={s.dayStart}
                onChange={(e) => e.target.value && update({ dayStart: e.target.value })}
              />
            </Field>
            <Field label="Day ends">
              <input
                type="time"
                className={`${inputClass} w-32!`}
                value={s.dayEnd}
                onChange={(e) => e.target.value && update({ dayEnd: e.target.value })}
              />
            </Field>
            <Field label="Notifications">
              <Switch
                label="Notifications"
                checked={s.notificationsEnabled}
                onChange={(next) => update({ notificationsEnabled: next })}
              />
            </Field>
            <Field label="Quiet hours start">
              <input
                type="time"
                className={`${inputClass} w-32!`}
                value={s.quietStart}
                onChange={(e) => e.target.value && update({ quietStart: e.target.value })}
              />
            </Field>
            <Field label="Quiet hours end">
              <input
                type="time"
                className={`${inputClass} w-32!`}
                value={s.quietEnd}
                onChange={(e) => e.target.value && update({ quietEnd: e.target.value })}
              />
            </Field>
          </>
        )}
      </Card>

      <Card label="Quick capture" className="mb-6">
        <h2 className="mb-2 text-lg font-semibold">Quick capture</h2>
        {s && (
          <>
            <Field label="Shortcut (works from any program)">
              <input
                readOnly
                data-testid="hotkey"
                aria-label="Capture shortcut"
                className={`${inputClass} w-56! text-center`}
                value={recording ? 'Press the new shortcut…' : s.captureHotkey}
                onFocus={() => setRecording(true)}
                onBlur={() => setRecording(false)}
                onKeyDown={(e) => {
                  if (e.key === 'Escape') return e.currentTarget.blur();
                  e.preventDefault();
                  const accelerator = acceleratorFrom(e);
                  if (accelerator) {
                    update({ captureHotkey: accelerator });
                    e.currentTarget.blur();
                  }
                }}
              />
            </Field>
            {info && !info.hotkeyRegistered && (
              <p className="mt-2 text-sm text-caution">
                Another program is using this shortcut, so it will not work yet. Click the box and
                press a different one.
              </p>
            )}
            <Field label="Keep running in the tray when the window closes">
              <Switch
                label="Keep running in the tray"
                checked={s.keepRunningInTray}
                onChange={(next) => update({ keepRunningInTray: next })}
              />
            </Field>
            <p className="mt-2 text-xs text-ink-muted">
              The shortcut needs Cortex running, so closing the window keeps it in the tray. Quit
              from the tray icon.
            </p>
          </>
        )}
      </Card>

      <Card label="Areas" className="mb-6">
        <h2 className="mb-2 text-lg font-semibold">Areas</h2>
        <ul>
          {(areas ?? []).map((a) => (
            <li
              key={a.id}
              className="flex items-center gap-3 border-b border-line py-2 last:border-0"
            >
              <span
                aria-hidden
                className="inline-block size-3 rounded-full"
                style={{ background: areaColor(a) }}
              />
              <input
                aria-label={`Name of ${a.name}`}
                className={`${inputClass} flex-1 ${a.archivedAt ? 'opacity-50' : ''}`}
                defaultValue={a.name}
                onBlur={(e) => {
                  const name = e.target.value.trim();
                  if (name && name !== a.name)
                    run(() => window.cortex.areas.update({ id: a.id, name }));
                }}
              />
              <button
                className={buttonQuiet}
                onClick={() =>
                  run(() => window.cortex.areas.update({ id: a.id, archived: !a.archivedAt }))
                }
              >
                {a.archivedAt ? 'Restore' : 'Archive'}
              </button>
            </li>
          ))}
        </ul>
        <form
          className="mt-4 flex flex-wrap items-center gap-2"
          onSubmit={(e) => {
            e.preventDefault();
            const name = newName.trim();
            if (!name) return;
            setNewName('');
            run(() => window.cortex.areas.create({ name, kind: newKind, colorToken: newColor }));
          }}
        >
          <input
            className={`${inputClass} w-56!`}
            aria-label="New area name"
            placeholder="New area"
            value={newName}
            onChange={(e) => setNewName(e.target.value)}
          />
          <select
            aria-label="Kind"
            className={`${inputClass} w-32!`}
            value={newKind}
            onChange={(e) => setNewKind(e.target.value as AreaKind)}
          >
            <option value="class">Class</option>
            <option value="coaching">Coaching</option>
            <option value="home">Home</option>
            <option value="admin">Admin</option>
            <option value="personal">Personal</option>
          </select>
          <span className="flex items-center gap-1">
            {AREA_COLOR_TOKENS.map((token) => (
              <button
                key={token}
                type="button"
                aria-label={token.replace('area-', '')}
                aria-pressed={newColor === token}
                className={`size-5 rounded-full border-2 ${newColor === token ? 'border-ink' : 'border-transparent'}`}
                style={{ background: `var(--color-${token})` }}
                onClick={() => setNewColor(token)}
              />
            ))}
          </span>
          <button className={buttonPrimary} disabled={!newName.trim()}>
            Add area
          </button>
        </form>
      </Card>

      <Card label="Backups" className="mb-6">
        <h2 className="mb-2 text-lg font-semibold">Backups</h2>
        <p className="text-sm text-ink-muted" data-testid="backup-info">
          {info?.lastBackup
            ? `Cortex makes a backup of your data every day and keeps the last 14. Latest: ${info.lastBackup} (${info.backupCount} kept).`
            : 'The first backup is made the next time Cortex starts.'}
        </p>
      </Card>
    </>
  );
}
