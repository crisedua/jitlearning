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
      className="overflow-hidden rounded-lg border border-[var(--color-line)] bg-[var(--color-surface)]"
    >
      <header className="flex items-start gap-4 border-b border-[var(--color-line)] px-5 py-4">
        <div className="min-w-0 flex-1">
          <p className="text-xs uppercase tracking-wide text-[var(--color-accent)]">
            {tutorial.product}
          </p>
          <h2 className="mt-0.5 text-sm font-medium text-gray-100">{tutorial.title}</h2>
        </div>
        <button
          onClick={onClose}
          aria-label="Cerrar el tutorial"
          className="shrink-0 rounded-md border border-[var(--color-line)] px-2.5 py-1 text-xs text-gray-400 hover:border-gray-500 hover:text-white"
        >
          Cerrar
        </button>
      </header>

      <div className="grid gap-0 md:grid-cols-[minmax(0,260px)_minmax(0,1fr)]">
        {/* Step rail */}
        <ol className="max-h-[26rem] overflow-y-auto border-b border-[var(--color-line)] md:border-b-0 md:border-r">
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
                  className={`flex w-full items-start gap-3 px-4 py-3 text-left text-sm transition ${
                    active
                      ? 'bg-[var(--color-accent)]/10 text-gray-100'
                      : 'text-gray-400 hover:bg-white/[0.03] hover:text-gray-200'
                  }`}
                >
                  <span
                    aria-hidden
                    className={`mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-full text-xs ${
                      active
                        ? 'bg-[var(--color-accent)] text-white'
                        : 'border border-[var(--color-line)] text-gray-500'
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
              className="w-full rounded-md border border-[var(--color-line)]"
            />
          )}

          <div>
            <h3 className="text-sm font-medium text-gray-100">
              Paso {step + 1} de {tutorial.steps.length} · {current.title}
            </h3>
            <p className="mt-1.5 text-sm leading-relaxed text-gray-300">{current.detail}</p>
          </div>

          {current.note && (
            <pre className="overflow-x-auto whitespace-pre-wrap break-words rounded-md border border-[var(--color-line)] bg-[var(--color-ink)] px-3 py-2.5 font-mono text-xs text-gray-300">
              {current.note}
            </pre>
          )}

          <div className="flex items-center gap-2">
            <button
              onClick={() => onStep(Math.max(0, step - 1))}
              disabled={step === 0}
              className="rounded-md border border-[var(--color-line)] px-3 py-1.5 text-xs text-gray-300 disabled:opacity-40 hover:border-gray-500"
            >
              Anterior
            </button>
            <button
              onClick={() => onStep(Math.min(tutorial.steps.length - 1, step + 1))}
              disabled={step === tutorial.steps.length - 1}
              className="rounded-md border border-[var(--color-line)] px-3 py-1.5 text-xs text-gray-300 disabled:opacity-40 hover:border-gray-500"
            >
              Siguiente
            </button>
          </div>
        </div>
      </div>

      <footer className="space-y-1 border-t border-[var(--color-line)] px-5 py-3">
        <p className="text-xs text-gray-500">
          Requisitos: <span className="text-gray-400">{tutorial.requires}</span>
        </p>
        {/*
          Said plainly and permanently. These are drawn diagrams, not captures of
          the real product, and a learner comparing them against their own screen
          needs to know that before they conclude they're on the wrong version.
        */}
        <p className="text-xs text-gray-500">
          Las imágenes son esquemas dibujados, no capturas reales. Pasos contrastados
          con la documentación oficial el {tutorial.checkedOn}; las interfaces cambian
          sin aviso.
        </p>
      </footer>
    </section>
  );
}
