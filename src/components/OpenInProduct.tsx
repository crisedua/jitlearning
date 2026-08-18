'use client';

import { useCallback, useState } from 'react';
import { handoffs, handoffNote, type Handoff } from '@/lib/handoff';

/**
 * "Now go and do it in your own account."
 *
 * Three buttons that copy the prompt and open the real Gemini, Claude or
 * ChatGPT. The bench is a rehearsal — the products cannot be embedded, and the
 * weekly saving this product sells has to keep working in the learner's own
 * account after they stop paying us. This is the door out.
 *
 * ## The clipboard write is not a convenience
 *
 * It happens before the tab opens, every time, including when the URL carries
 * the prompt. Those query parameters are undocumented and have moved before, so
 * the button is built to survive them disappearing: worst case the learner
 * lands in the real product and presses ⌘V, which is what they would have done
 * anyway. Nothing here breaks when a third party changes their mind.
 */
export function OpenInProduct({ prompt, label }: { prompt: string; label?: string }) {
  const [done, setDone] = useState<Handoff | null>(null);
  const [failed, setFailed] = useState(false);

  const go = useCallback(async (handoff: Handoff) => {
    setFailed(false);

    /*
     * Copy first, open second, and never let the copy stop the open.
     *
     * `navigator.clipboard` needs a secure context and a live user gesture, and
     * it rejects in a few real situations — an older browser, a denied
     * permission, an iframe. None of those is a reason to strand somebody on
     * this page: the tab still opens, they still have the prompt on screen to
     * select by hand, and the note tells them which happened.
     */
    try {
      await navigator.clipboard.writeText(prompt);
    } catch {
      setFailed(true);
    }

    /*
     * `noopener` because the opened page gets a handle on `window.opener`
     * otherwise, and it is a third-party origin we do not control.
     */
    window.open(handoff.url, '_blank', 'noopener,noreferrer');
    setDone(handoff);
  }, [prompt]);

  if (!prompt.trim()) return null;

  return (
    <div className="mt-3">
      <p className="text-[11px] font-semibold uppercase tracking-[0.1em] text-soft">
        {label ?? 'Ahora hazlo en tu cuenta'}
      </p>

      <div className="mt-2 flex flex-wrap gap-2">
        {handoffs(prompt).map((h) => (
          <button
            key={h.id}
            type="button"
            onClick={() => void go(h)}
            className="rounded-full border border-line bg-surface px-4 py-1.5 text-[13px] font-medium text-ink transition-colors duration-150 hover:border-line-strong hover:text-accent"
          >
            Abrir en {h.label}
          </button>
        ))}
      </div>

      {done && (
        <p className="mt-2 text-xs text-muted" role="status">
          {failed
            ? `No pude copiarla sola. Selecciónala aquí arriba y pégala en ${done.label}.`
            : handoffNote(done)}
        </p>
      )}
    </div>
  );
}
