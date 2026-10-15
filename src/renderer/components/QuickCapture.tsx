import { useEffect, useRef, useState } from 'react';
import { errorMessage } from '@/hooks/useLive';
import { ErrorNote, buttonPrimary, buttonQuiet, inputClass } from './ui';
export function QuickCapture({ onClose }: { onClose(): void }) {
  const dialog = useRef<HTMLDialogElement>(null);
  const [text, setText] = useState(''),
    [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  useEffect(() => {
    dialog.current?.showModal();
  }, []);
  return (
    <dialog
      ref={dialog}
      aria-labelledby="quick-capture-title"
      className="pulse-capture-dialog"
      onCancel={onClose}
    >
      <form
        onSubmit={async (e) => {
          e.preventDefault();
          if (!text.trim() || saving) return;
          setSaving(true);
          setError(null);
          try {
            await window.cortex.capture.submit(text);
            onClose();
          } catch (e) {
            setError(errorMessage(e));
            setSaving(false);
          }
        }}
      >
        <h2 id="quick-capture-title">Get it off your mind.</h2>
        <p>A title is enough. Sort the details later.</p>
        <ErrorNote message={error} />
        <input
          className={inputClass}
          aria-label="Capture a task"
          placeholder="What do you want to remember?"
          value={text}
          onChange={(e) => setText(e.target.value)}
          maxLength={2000}
          required
          disabled={saving}
          autoFocus
        />
        <div>
          <button type="button" className={buttonQuiet} onClick={onClose}>
            Cancel
          </button>
          <button className={buttonPrimary} disabled={saving || !text.trim()}>
            {saving ? 'Saving…' : 'Save to inbox'}
          </button>
        </div>
      </form>
    </dialog>
  );
}
