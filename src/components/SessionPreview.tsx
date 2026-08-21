'use client';

import { useEffect, useState } from 'react';

const QUESTION = 'Listo, quedó armado. Me tomó veinte minutos.';
const ANSWER =
  'Antes tardabas noventa. Acabas de recuperar setenta minutos, y eso se repite cada semana que hagas este informe. Te lo anoto en tu página de progreso.';
/*
 * The line under the card, which is where the demo says what it means.
 *
 * It used to defend the arithmetic ("los dos números los pusiste tú"), which
 * answered a doubt nobody had yet and made the saving the point. The exchange
 * above is unchanged; what it is evidence *of* is not.
 */
const SOURCE =
  'Esto no es solo tiempo recuperado. Es una tarea de tu trabajo que ahora sabes resolver con IA, y quedó registrada.';

/** Milliseconds from the start of a loop at which each stage begins. */
const CUES = { userTyping: 600, user: 2000, coachTyping: 3000, coach: 4600 } as const;
const TYPE_MS = 26;
const HOLD_MS = 7000;

/**
 * The hero's replay of the moment the product pays for itself.
 *
 * Not the opening question: the end of the first session, where the learner says
 * how long the task took and the teacher says the subtraction. That is the whole
 * pitch in two lines, and it is the exact exchange the session spine produces, so
 * the demo promises nothing the product does not do.
 *
 * ## What this used to be, and why that mattered
 *
 * It replayed the retired entrepreneur coach: an idea-validation question,
 * answered with Noah Kagan's 48-hour rule, footnoted "que está en la base de
 * conocimiento". That corpus moved to `knowledge/_retired/` two products ago, so
 * the most persuasive element on the landing page was demonstrating a coach that
 * no longer exists and citing a source the agent can no longer retrieve. A
 * fabricated citation, on the home page, of a product whose entire claim is that
 * it does not fabricate citations.
 *
 * Whatever replaces this has to be an exchange the current persona actually
 * produces. Check it against `### Primera sesión` in `agent.ts` before changing a
 * word of it.
 *
 * The animated region is hidden from assistive tech — a typewriter effect
 * re-announces the same sentence on every character. The exchange is exposed
 * once, as static text, in the visually-hidden paragraph below it.
 */
export function SessionPreview() {
  const [step, setStep] = useState(0);
  const [typed, setTyped] = useState(0);

  useEffect(() => {
    // Honour the OS setting rather than animating and hoping: land on the
    // finished state and stop.
    const reduced =
      typeof window !== 'undefined' &&
      window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    if (reduced) {
      setStep(5);
      setTyped(ANSWER.length);
      return;
    }

    let cancelled = false;
    const timers: ReturnType<typeof setTimeout>[] = [];
    let typer: ReturnType<typeof setInterval> | undefined;

    const at = (ms: number, fn: () => void) => {
      timers.push(setTimeout(fn, ms));
    };

    const run = () => {
      if (cancelled) return;
      setStep(0);
      setTyped(0);
      at(CUES.userTyping, () => setStep(1));
      at(CUES.user, () => setStep(2));
      at(CUES.coachTyping, () => setStep(3));
      at(CUES.coach, () => {
        setStep(4);
        typer = setInterval(() => {
          setTyped((n) => {
            if (n + 1 < ANSWER.length) return n + 1;
            clearInterval(typer);
            at(700, () => setStep(5));
            at(HOLD_MS, run);
            return ANSWER.length;
          });
        }, TYPE_MS);
      });
    };

    run();
    return () => {
      cancelled = true;
      timers.forEach(clearTimeout);
      clearInterval(typer);
    };
  }, []);

  /*
   * A dark card, so the demo reads as a screen rather than as more page.
   *
   * This sat on `bg-surface` with a hairline, which put white on cream beside a
   * white hero: the one element that shows the product working was the one with
   * the least separation from everything around it. Inverting it costs nothing
   * structurally and makes the panel the thing the eye lands on.
   *
   * Text on it is `bg` — the page cream used as a foreground, which is the same
   * pairing every filled button in the product already uses and the one the
   * palette test knows about.
   */
  return (
    <div className="rounded-xl bg-accent-deep p-6 shadow-lg sm:p-7">
      <div className="flex items-center justify-between gap-4 border-b border-bg/15 pb-4">
        <span className="text-[11px] font-semibold uppercase tracking-[0.14em] text-bg/60">
          El final de la primera clase
        </span>
        <Waveform />
      </div>

      <div aria-hidden className="flex min-h-[13rem] flex-col gap-3.5 pb-1 pt-5">
        {step === 1 && <TypingDots side="user" />}
        {step >= 2 && (
          <p className="animate-pop max-w-[85%] self-end rounded-[16px_16px_4px_16px] bg-accent px-4 py-3 text-[15px] leading-relaxed text-bg">
            {QUESTION}
          </p>
        )}
        {step === 3 && <TypingDots side="coach" />}
        {step >= 4 && (
          <p className="animate-pop max-w-[92%] self-start rounded-[16px_16px_16px_4px] border border-bg/12 bg-bg/[0.07] px-4 py-3.5 text-[15px] leading-relaxed text-bg">
            {step >= 5 ? ANSWER : ANSWER.slice(0, typed)}
            <span className="ml-0.5 inline-block h-[15px] w-0.5 -translate-y-px bg-gold align-[-2px] [animation:caret_1s_step-end_infinite]" />
          </p>
        )}
      </div>

      {step >= 5 && (
        <p
          aria-hidden
          className="animate-fade mt-3.5 flex items-baseline gap-2.5 border-t border-bg/15 pt-3.5 text-[13px] leading-relaxed text-bg/70"
        >
          <span className="mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full bg-gold" />
          {SOURCE}
        </p>
      )}

      <p className="sr-only">
        Ejemplo de conversación al final de la primera clase. Tú: «{QUESTION}» Profesor: «{ANSWER}»{' '}
        {SOURCE}
      </p>
    </div>
  );
}

/** Five bars pulsing out of phase — the only "it is listening" cue on the page. */
function Waveform() {
  return (
    <span aria-hidden className="flex h-4.5 items-end gap-[3px]">
      {[0, 0.12, 0.24, 0.36, 0.48].map((delay, i) => (
        <span
          key={delay}
          style={{ animationDelay: `${delay}s` }}
          className={`h-full w-[3px] origin-bottom rounded-sm [animation:bar_1.1s_ease-in-out_infinite] ${
            i === 2 ? 'bg-gold' : 'bg-accent'
          }`}
        />
      ))}
    </span>
  );
}

function TypingDots({ side }: { side: 'user' | 'coach' }) {
  const user = side === 'user';
  return (
    <span
      className={`animate-pop flex items-center gap-1.5 px-4 py-3 ${
        user
          ? 'self-end rounded-[16px_16px_4px_16px] bg-accent'
          : 'self-start rounded-[16px_16px_16px_4px] bg-bg/[0.07]'
      }`}
    >
      {[0, 0.15, 0.3].map((delay) => (
        <span
          key={delay}
          style={{ animationDelay: `${delay}s` }}
          className={`h-1.5 w-1.5 rounded-full [animation:dot_1.2s_ease-in-out_infinite] ${
            user ? 'bg-bg/70' : 'bg-bg/50'
          }`}
        />
      ))}
    </span>
  );
}
