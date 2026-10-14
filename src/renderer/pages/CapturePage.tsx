import { useEffect, useRef, useState } from 'react';
import { errorMessage } from '@/hooks/useLive';

/**
 * The quick-capture window. Type, press Enter, and it is in the Inbox: `#home` files it in an
 * area, `!fri` or `!tomorrow` sets a due date. Esc closes it without saving.
 */
export function CapturePage() {
  const [text, setText] = useState('');
  const [error, setError] = useState<string | null>(null);
  const input = useRef<HTMLInputElement>(null);

  useEffect(() => {
    input.current?.focus();
    return window.cortex.capture.onShown(() => {
      setText('');
      setError(null);
      input.current?.focus();
    });
  }, []);

  async function submit() {
    const value = text.trim();
    if (!value) return;
    try {
      await window.cortex.capture.submit(value);
      setText('');
      setError(null);
      await window.cortex.capture.hide();
    } catch (e) {
      setError(errorMessage(e));
    }
  }

  return (
    <div className="flex h-full flex-col justify-center rounded-card border border-line bg-surface px-5">
      <input
        ref={input}
        aria-label="Capture a task"
        className="w-full bg-transparent text-xl text-ink outline-none placeholder:text-ink-muted"
        placeholder="What's on your mind?"
        value={text}
        maxLength={2000}
        onChange={(e) => setText(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === 'Enter') void submit();
          if (e.key === 'Escape') void window.cortex.capture.hide();
        }}
      />
      <p className="mt-2 text-xs text-ink-muted">
        {error ?? 'Enter saves to your Inbox · #area files it · !fri sets a due date · Esc closes'}
      </p>
    </div>
  );
}
