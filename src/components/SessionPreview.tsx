'use client';

import { useEffect, useState } from 'react';

const QUESTION = 'Tengo una idea de negocio pero no sé si alguien pagaría por ella.';
const ANSWER =
  'Entonces todavía no toca construir nada. Busca tres personas que te paguen en cuarenta y ocho horas. ¿A quién podrías escribirle hoy mismo?';
const SOURCE =
  'Respuesta fundamentada en la regla de validación de Noah Kagan, que está en la base de conocimiento.';

/** Milliseconds from the start of a loop at which each stage begins. */
const CUES = { userTyping: 600, user: 2000, coachTyping: 3000, coach: 4600 } as const;
const TYPE_MS = 26;
const HOLD_MS = 7000;

/**
 * The hero's replay of a real exchange.
 *
 * It sells the tone of the thing rather than describing it: someone asks
 * whether their idea would sell, and the coach pushes back with the validation
 * rule instead of agreeing. The words are the ones the corpus actually
 * supports, so the demo does not promise behaviour the product lacks.
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

  return (
    <div className="rounded-xl border border-line bg-surface p-6 shadow-lg sm:p-7">
      <div className="flex items-center justify-between gap-4 border-b border-line pb-4">
        <span className="text-[11px] font-semibold uppercase tracking-[0.14em] text-soft">
          Así suena una sesión
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
          <p className="animate-pop max-w-[92%] self-start rounded-[16px_16px_16px_4px] border border-line bg-bg px-4 py-3.5 text-[15px] leading-relaxed text-ink">
            {step >= 5 ? ANSWER : ANSWER.slice(0, typed)}
            <span className="ml-0.5 inline-block h-[15px] w-0.5 -translate-y-px bg-gold align-[-2px] [animation:caret_1s_step-end_infinite]" />
          </p>
        )}
      </div>

      {step >= 5 && (
        <p
          aria-hidden
          className="animate-fade mt-3.5 flex items-baseline gap-2.5 border-t border-line pt-3.5 text-[13px] leading-relaxed text-soft"
        >
          <span className="mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full bg-gold" />
          {SOURCE}
        </p>
      )}

      <p className="sr-only">
        Ejemplo de conversación. Tú: «{QUESTION}» Coach: «{ANSWER}» {SOURCE}
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
          ? 'self-end rounded-[16px_16px_4px_16px] bg-accent-soft'
          : 'self-start rounded-[16px_16px_16px_4px] bg-surface-alt'
      }`}
    >
      {[0, 0.15, 0.3].map((delay) => (
        <span
          key={delay}
          style={{ animationDelay: `${delay}s` }}
          className={`h-1.5 w-1.5 rounded-full [animation:dot_1.2s_ease-in-out_infinite] ${
            user ? 'bg-accent' : 'bg-soft'
          }`}
        />
      ))}
    </span>
  );
}
