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
    /*
     * One line, not a block.
     *
     * This was a heading, three pill buttons and a status sentence — four
     * elements under a panel that already carries a thread, a composer and a
     * meter, for an action taken once at the end. Buttons that size announce
     * themselves as the next thing to do, and this is not: the next thing is
     * to look at the answer.
     *
     * Text links in a row read as a footnote, which is the right weight, and
     * the note only appears after a click, when it is an answer rather than an
     * instruction nobody asked for.
     */
    <p className="mt-3 text-xs text-muted">
      {label ?? 'Ahora hazlo en tu cuenta'}:{' '}
      {handoffs(prompt).map((h, i) => (
        <span key={h.id}>
          {i > 0 && <span aria-hidden> · </span>}
          <button
            type="button"
            onClick={() => void go(h)}
            className="underline underline-offset-2 transition-colors duration-150 hover:text-accent"
          >
            {h.label}
          </button>
        </span>
      ))}
      {done && (
        <span className="block pt-1 text-soft" role="status">
          {failed
            ? `No pude copiarla sola. Selecciónala arriba y pégala en ${done.label}.`
            : handoffNote(done)}
        </span>
      )}
    </p>
  );
}
