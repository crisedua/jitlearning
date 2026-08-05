'use client';

import { useMemo } from 'react';
import { topicsFor } from '@/lib/topics';
import type { Coach } from '@/lib/coaches';

/**
 * What the coach can do, as something you use rather than something you read.
 *
 * A voice interface announces nothing about its own scope. The learner arrives
 * at a microphone button and has to guess what is worth asking, and a wrong
 * guess costs a spoken turn to discover. The sidebar already lists the topics;
 * this is the part that turns the list into a first question.
 *
 * The one interaction that matters: tapping a question **starts the session on
 * that question**. Not "copies it to a field", not "shows you an example" — one
 * tap from curiosity to a conversation already in progress. Everything else
 * here is in service of making that tap obvious.
 *
 * Shown only before connecting. Once the conversation is live it would compete
 * with the transcript for the same attention, and the sidebar covers the same
 * ground for anyone who needs it mid-session.
 *
 * The audience filter that used to sit at the top is gone: picking a coach on
 * the previous screen already did that separating, and one coach's questions
 * fit on the page without needing to be sampled down to one per topic.
 */

/**
 * What the coach does with any answer, whatever the topic.
 *
 * These are behaviours the persona is instructed to perform and a learner can
 * check in one session — the same claims the landing page makes. If one is
 * removed from the persona it has to come out of here too, or the page starts
 * promising something the coach does not do.
 */
const howItAnswers = (coach: Coach) => [
  {
    label: 'Te nombra la fuente',
    // Drawn from the coach so the example names something its corpus actually
    // contains. A promise illustrated with a source this coach cannot cite is
    // the one kind of drift this list exists to prevent.
    detail: `«${coach.citationExample.split(' o ')[0]?.replace(/^"|"$/g, '')}» — mientras responde, no al final.`,
  },
  {
    label: 'No promedia a los autores',
    detail: 'Cuando dos fuentes se contradicen te lo dice, y te dice cuál encaja con tu caso.',
  },
  {
    label: 'Cierra con un compromiso',
    detail: 'Una cosa, con fecha, y qué señal contaría como que salió bien.',
  },
  {
    label: 'Te avisa cuando no sabe',
    detail: 'Si no tiene material sobre algo, lo dice antes de responder.',
  },
] as const;

export function CoachExplorer({
  coach,
  onAsk,
  busy,
}: {
  coach: Coach;
  /** Starts the session on this question. */
  onAsk: (question: string) => void;
  busy: boolean;
}) {
  const topics = useMemo(() => topicsFor(coach.id), [coach.id]);

  const questions = useMemo(
    () =>
      topics.flatMap((topic) =>
        topic.examples.map((question) => ({
          question,
          topic: topic.title,
          isNew: Boolean(topic.isNew),
        })),
      ),
    [topics],
  );

  const hasNew = topics.some((t) => t.isNew);

  return (
    <section className="animate-rise overflow-hidden rounded-lg border border-line bg-surface shadow-sm">
      <header className="flex flex-wrap items-start justify-between gap-3 border-b border-line bg-surface-alt/50 px-5 py-4 sm:px-6">
        <div>
          <h2 className="font-serif text-[22px] font-normal leading-tight tracking-[-0.01em]">
            Empieza por una pregunta real
          </h2>
          <p className="mt-1 text-[13px] leading-relaxed text-muted">
            Toca cualquiera y la sesión arranca hablando de eso. Todas las preguntas para
            las que este coach tiene material, o escribe la tuya arriba.
          </p>
        </div>

        {hasNew && (
          <span className="inline-flex shrink-0 items-center gap-2 rounded-full border border-gold/40 bg-gold-soft/50 px-3 py-1 text-[11px] font-semibold uppercase tracking-[0.08em] text-warning">
            <span
              aria-hidden
              className="h-1.5 w-1.5 rounded-full bg-gold [animation:ring_2.2s_ease-out_infinite]"
            />
            Material nuevo
          </span>
        )}
      </header>

      <ul className="grid gap-2.5 px-5 py-5 sm:grid-cols-2 sm:px-6">
        {questions.map(({ question, topic, isNew }, i) => (
          <li key={question}>
            <button
              type="button"
              onClick={() => onAsk(question)}
              disabled={busy}
              style={{ animationDelay: `${Math.min(i, 8) * 35}ms` }}
              className="group animate-pop flex h-full w-full flex-col items-start gap-2 rounded-md border border-line bg-surface px-4 py-3.5 text-left transition duration-200 ease-out hover:-translate-y-0.5 hover:border-accent/40 hover:bg-accent-soft/25 hover:shadow-md disabled:pointer-events-none disabled:opacity-50"
            >
              <span className="flex items-center gap-2 text-[11px] font-semibold uppercase tracking-[0.08em] text-soft">
                {topic}
                {isNew && (
                  <span className="rounded-full bg-gold-soft px-1.5 py-px text-[10px] font-semibold tracking-normal text-warning">
                    nuevo
                  </span>
                )}
              </span>

              <span className="text-[15px] font-medium leading-snug text-ink">
                «{question}»
              </span>

              <span className="mt-auto flex items-center gap-1.5 pt-1 text-[12px] font-medium text-accent opacity-0 transition-opacity duration-200 ease-out group-hover:opacity-100 group-focus-visible:opacity-100">
                Empezar con esta
                <span aria-hidden>→</span>
              </span>
            </button>
          </li>
        ))}
      </ul>

      {/* What happens next, whatever they picked. Four checkable promises. */}
      <div className="border-t border-line bg-surface-alt/40 px-5 py-4 sm:px-6">
        <p className="text-[11px] font-semibold uppercase tracking-[0.1em] text-soft">
          Responda lo que responda
        </p>
        <ul className="mt-3 grid gap-x-6 gap-y-2.5 sm:grid-cols-2">
          {howItAnswers(coach).map((item) => (
            <li key={item.label} className="flex items-start gap-2.5">
              <span
                aria-hidden
                className="mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full bg-gold"
              />
              <p className="text-[13px] leading-relaxed text-muted">
                <span className="font-semibold text-ink">{item.label}.</span>{' '}
                {item.detail}
              </p>
            </li>
          ))}
        </ul>
      </div>
    </section>
  );
}

