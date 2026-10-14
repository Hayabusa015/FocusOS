import { useState } from 'react';
import { Card } from './ui';

function Option({ name, children }: { name: string; children: React.ReactNode }) {
  return (
    <div className="flex flex-col items-start gap-3 rounded-lg border border-line p-4">
      <span className="text-xs font-semibold uppercase tracking-wide text-ink-muted">{name}</span>
      {children}
    </div>
  );
}

function Group({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="mb-6 last:mb-0">
      <h3 className="mb-2 text-sm font-medium">{title}</h3>
      <div className="grid gap-3 sm:grid-cols-3">{children}</div>
    </div>
  );
}

function Switch({ label, variant = '' }: { label: string; variant?: string }) {
  const [on, setOn] = useState(false);
  return (
    <label className="flex items-center gap-3 text-sm">
      <span className={`switch ${variant}`}>
        <input
          type="checkbox"
          role="switch"
          checked={on}
          onChange={(e) => setOn(e.target.checked)}
        />
        <span className="track" />
      </span>
      {label}
    </label>
  );
}

function Check({ label, variant = '' }: { label: string; variant?: string }) {
  const [on, setOn] = useState(false);
  return (
    <label className="flex items-center gap-3 text-sm">
      <span className={`check ${variant}`}>
        <input type="checkbox" checked={on} onChange={(e) => setOn(e.target.checked)} />
        <span className="box" />
      </span>
      {label}
    </label>
  );
}

/** Candidate control styles to choose from. Temporary: removed once the choices are applied. */
export function StylePreview() {
  return (
    <Card label="Style preview" className="mb-6">
      <h2 className="mb-1 text-lg font-semibold">Style preview</h2>
      <p className="mb-4 text-sm text-ink-muted">
        Options for buttons, switches, checkboxes and loaders. Try them, then tell me which letters
        you like. This section goes away once they are applied.
      </p>
      <Group title="Buttons">
        <Option name="A · Press">
          <button className="btn btn-press">Done</button>
        </Option>
        <Option name="B · Offset">
          <button className="btn btn-offset">Done</button>
        </Option>
        <Option name="C · Sweep">
          <button className="btn btn-sweep">Done</button>
        </Option>
      </Group>
      <Group title="Switches">
        <Option name="A · Pill">
          <Switch label="Notifications" />
        </Option>
        <Option name="B · Labelled">
          <Switch label="Notifications" variant="switch-label" />
        </Option>
      </Group>
      <Group title="Checkboxes">
        <Option name="A · Square">
          <Check label="Order lab goggles" />
        </Option>
        <Option name="B · Round">
          <Check label="Order lab goggles" variant="check-round" />
        </Option>
      </Group>
      <Group title="Loaders">
        <Option name="A · Ring">
          <div className="loader-ring" role="status" aria-label="Loading" />
        </Option>
        <Option name="B · Dots">
          <div className="loader-dots" role="status" aria-label="Loading">
            <span />
            <span />
            <span />
          </div>
        </Option>
        <Option name="C · Glow">
          <div className="loader-glow" role="status" aria-label="Loading" />
        </Option>
        <Option name="D · Bar">
          <div className="loader-bar" role="status" aria-label="Loading" />
        </Option>
      </Group>
    </Card>
  );
}
