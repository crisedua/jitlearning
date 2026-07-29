'use client';

import { useEffect, useRef } from 'react';
import type { Tutorial } from '@/lib/tutorials';

/**
 * The visual half of a spoken tutorial.
 *
 * The coach drives this: it calls the `mostrar_tutorial` client tool, which sets
 * the tutorial, and it advances steps as it talks. The panel is therefore a
 * *display*, not a control surface — but the learner can still click any step,
 * because losing your place while someone talks is the whole problem visuals
 * are here to solve.
 */
export function TutorialPanel({
  tutorial,
  step,
  onStep,
  onClose,
}: {
  tutorial: Tutorial;
  /** Zero-based. */
  step: number;
  onStep: (index: number) => void;
  onClose: () => void;
}) {
  const current = tutorial.steps[step] ?? tutorial.steps[0]!;
  const figureUrl = current.figure ? `/tutoriales/${current.figure}` : undefined;
  const stepRefs = useRef<Array<HTMLButtonElement | null>>([]);

  // The agent moves the step, so the active one has to scroll itself into view.
  useEffect(() => {
    stepRefs.current[step]?.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
  }, [step]);

  return (
    <section
      aria-label={`Tutorial: ${tutorial.title}`}
      className="animate-rise overflow-hidden rounded-lg border border-line bg-surface shadow-md"
    >
      <header className="flex items-start gap-4 border-b border-line bg-surface-alt/60 px-5 py-4">
        <div className="min-w-0 flex-1">
          <p className="text-[11px] font-semibold uppercase tracking-[0.08em] text-accent">
            {tutorial.product}
          </p>
          <h2 className="mt-1 text-sm font-semibold text-ink">{tutorial.title}</h2>
        </div>
        <button
          onClick={onClose}
          aria-label="Cerrar el tutorial"
          className="shrink-0 rounded-md border border-line bg-surface px-3 py-1.5 text-xs font-medium text-muted shadow-sm transition duration-150 ease-out hover:border-line-strong hover:text-ink"
        >
          Cerrar
        </button>
      </header>

      <div className="grid gap-0 md:grid-cols-[minmax(0,260px)_minmax(0,1fr)]">
        {/* Step rail */}
        <ol className="scroll-soft max-h-[26rem] overflow-y-auto border-b border-line md:border-b-0 md:border-r">
          {tutorial.steps.map((s, i) => {
            const active = i === step;
            return (
              <li key={i}>
                <button
                  ref={(el) => {
                    stepRefs.current[i] = el;
                  }}
                  onClick={() => onStep(i)}
                  aria-current={active ? 'step' : undefined}
                  className={`flex w-full items-start gap-3 px-4 py-3 text-left text-sm transition-colors duration-150 ease-out ${
                    active
                      ? 'bg-accent-soft/60 font-medium text-ink'
                      : 'text-muted hover:bg-surface-alt/70 hover:text-ink'
                  }`}
                >
                  <span
                    aria-hidden
                    className={`mt-px flex h-5 w-5 shrink-0 items-center justify-center rounded-full text-[11px] font-semibold ${
                      active
                        ? 'bg-accent text-white'
                        : 'border border-line-strong text-muted'
                    }`}
                  >
                    {i + 1}
                  </span>
                  <span className="min-w-0">{s.title}</span>
                </button>
              </li>
            );
          })}
        </ol>

        {/* Active step */}
        <div className="min-w-0 space-y-4 p-5">
          {figureUrl && (
            <img
              src={figureUrl}
              alt={`Esquema del paso ${step + 1}: ${current.title}`}
              className="w-full rounded-md border border-line bg-surface-alt/40"
            />
          )}

          <div>
            <h3 className="text-sm font-semibold text-ink">
              Paso {step + 1} de {tutorial.steps.length} · {current.title}
            </h3>
            <p className="mt-1.5 max-w-prose text-sm leading-relaxed text-muted">
              {current.detail}
            </p>
          </div>

          {current.note && (
            <pre className="overflow-x-auto whitespace-pre-wrap break-words rounded-md border border-line bg-surface-alt/70 px-3.5 py-3 font-mono text-xs leading-relaxed text-ink">
              {current.note}
            </pre>
          )}

          <div className="flex items-center gap-2">
            <button
              onClick={() => onStep(Math.max(0, step - 1))}
              disabled={step === 0}
              className="rounded-md border border-line bg-surface px-3.5 py-1.5 text-xs font-medium text-ink shadow-sm transition duration-150 ease-out hover:border-line-strong disabled:opacity-40 disabled:shadow-none"
            >
              Anterior
            </button>
            <button
              onClick={() => onStep(Math.min(tutorial.steps.length - 1, step + 1))}
              disabled={step === tutorial.steps.length - 1}
              className="rounded-md border border-line bg-surface px-3.5 py-1.5 text-xs font-medium text-ink shadow-sm transition duration-150 ease-out hover:border-line-strong disabled:opacity-40 disabled:shadow-none"
            >
              Siguiente
            </button>
          </div>
        </div>
      </div>

      <footer className="space-y-1 border-t border-line bg-surface-alt/60 px-5 py-3.5">
        <p className="text-xs text-muted">
          Requisitos: <span className="text-ink/75">{tutorial.requires}</span>
        </p>
        {/*
          Said plainly and permanently. These are drawn diagrams, not captures of
          the real product, and a learner comparing them against their own screen
          needs to know that before they conclude they're on the wrong version.
        */}
        <p className="text-xs leading-relaxed text-muted">
          Las imágenes son esquemas dibujados, no capturas reales. Pasos contrastados con
          la documentación oficial el {tutorial.checkedOn}; las interfaces cambian sin
          aviso.
        </p>
      </footer>
    </section>
  );
}
