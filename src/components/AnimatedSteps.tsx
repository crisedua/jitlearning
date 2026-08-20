import { STEPS } from '@/lib/site';

/**
 * The "cómo funciona" list with a looping vignette per step, so the band shows
 * the session instead of describing it in 5 paragraphs of prose.
 *
 * All motion is CSS. The five vignette boxes share one 12.5s `stage` cycle
 * offset by a fifth each, so exactly one is lit at any moment and the sequence
 * walks down the list on its own — which is the whole explanation, animated.
 * Every vignette is `aria-hidden`: the content is the visible title and body,
 * and the global reduced-motion rule collapses the loops to their end state.
 *
 * There are exactly as many vignettes as `STEPS` entries; the render falls back
 * to the first vignette if the list ever grows, rather than crashing the page.
 */
const STAGE_DELAYS = ['0s', '2.5s', '5s', '7.5s', '10s'] as const;

const VIGNETTES = [
  QuestionsVignette,
  PrivacyVignette,
  TaskVignette,
  MeasureVignette,
  PlanVignette,
] as const;

export function AnimatedSteps() {
  return (
    <ol className="flex flex-col">
      {STEPS.map((step, i) => {
        const Vignette = VIGNETTES[i] ?? VIGNETTES[0];
        return (
          <li
            key={step.title}
            style={{ animationRange: `entry 0% entry ${60 + i * 8}%` }}
            className={`reveal grid grid-cols-[4.75rem_1fr] items-start gap-5 border-t border-line-strong py-6 ${
              i === STEPS.length - 1 ? 'border-b' : ''
            }`}
          >
            <span
              aria-hidden
              style={{ animationDelay: STAGE_DELAYS[i] ?? '0s' }}
              className="grid h-[4.25rem] w-[4.75rem] place-items-center rounded-md border border-line bg-surface [animation:stage_12.5s_ease-in-out_infinite]"
            >
              <Vignette />
            </span>
            <div>
              <h3 className="flex items-baseline gap-2.5 text-xl font-semibold">
                <span aria-hidden className="font-mono text-[13px] font-normal text-soft">
                  {String(i + 1).padStart(2, '0')}
                </span>
                {step.title}
              </h3>
              <p className="mt-1.5 max-w-[52ch] text-base leading-relaxed text-muted">
                {step.body}
              </p>
            </div>
          </li>
        );
      })}
    </ol>
  );
}

/** Paso 1 — the interview: a question bubble typing, a short answer beside it. */
function QuestionsVignette() {
  return (
    <span className="flex flex-col items-start gap-1.5">
      <span className="flex items-center gap-1 rounded-[10px_10px_10px_3px] bg-accent-soft px-2.5 py-1.5">
        {[0, 0.15, 0.3].map((delay) => (
          <span
            key={delay}
            style={{ animationDelay: `${delay}s` }}
            className="h-1 w-1 rounded-full bg-accent [animation:dot_1.2s_ease-in-out_infinite]"
          />
        ))}
      </span>
      <span className="ml-4 block h-2 w-7 rounded-[8px_8px_3px_8px] bg-accent/80" />
    </span>
  );
}

/** Paso 2 — privacy first: a document with two lines left readable and two redacted. */
function PrivacyVignette() {
  return (
    <span className="relative block h-11 w-9 rounded-[4px] border border-line-strong bg-bg px-1.5 py-2">
      <span className="block h-1 w-5 rounded-full bg-line-strong" />
      <span className="mt-1 block h-1 w-4 rounded-full bg-ink/70" />
      <span className="mt-1 block h-1 w-5 rounded-full bg-ink/70" />
      <span className="mt-1 block h-1 w-3 rounded-full bg-line" />
      <span className="absolute -right-1.5 -top-1.5 h-3 w-3 rounded-full bg-gold [animation:ring_2.4s_ease-out_infinite]" />
    </span>
  );
}

/** Paso 3 — the task getting done: a progress bar filling over its checklist. */
function TaskVignette() {
  return (
    <span className="flex w-11 flex-col gap-1.5">
      <span className="block h-1 w-8 rounded-full bg-line" />
      <span className="block h-1 w-6 rounded-full bg-line" />
      <span className="mt-0.5 block h-2 overflow-hidden rounded-full bg-accent-soft">
        <span className="block h-full w-full origin-left rounded-full bg-accent [animation:wipe_2.6s_var(--ease-out)_infinite]" />
      </span>
    </span>
  );
}

/** Paso 4 — the 2 numbers: the tall "antes" bar, the short gold "ahora" bar. */
function MeasureVignette() {
  return (
    <span className="flex items-end gap-2">
      <span className="block h-9 w-3 rounded-sm bg-line-strong" />
      <span className="block h-4 w-3 rounded-sm bg-gold [animation:pulsefade_2.2s_ease-in-out_infinite]" />
      <span className="mb-0.5 font-mono text-[11px] leading-none text-soft">-h</span>
    </span>
  );
}

/** Paso 5 — the plan: the levels lighting up in order along a line. */
function PlanVignette() {
  return (
    <span className="relative flex w-12 items-center justify-between">
      <span aria-hidden className="absolute inset-x-0 top-1/2 h-px -translate-y-1/2 bg-line-strong" />
      {[0, 0.2, 0.4, 0.6].map((delay, i) => (
        <span
          key={delay}
          style={{ animationDelay: `${delay}s` }}
          className={`relative h-2 w-2 rounded-full [animation:dot_1.6s_ease-in-out_infinite] ${
            i === 0 ? 'bg-gold' : 'bg-accent'
          }`}
        />
      ))}
    </span>
  );
}
