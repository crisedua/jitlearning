'use client';

import { useMemo } from 'react';
import { TOPICS } from '@/lib/topics';

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
 * There is one teacher, so there is no filtering left to do here: every question
 * fits on the page.
 */

/**
 * What the teacher does with any answer, whatever the topic.
 *
 * These are behaviours the persona is instructed to perform and a learner can
 * check in one session, which is the same standard the landing page holds itself
 * to. Removing one from the persona means removing it from here.
 */
const HOW_IT_ANSWERS: { label: string; detail: string; needsTool?: boolean }[] = [
  {
    label: 'Te dice de dónde viene',
    detail:
      'Cuando la respuesta sale de su material lo nombra mientras responde; cuando es criterio general, lo dice.',
  },
  {
    label: 'No promedia a las fuentes',
    detail: 'Cuando dos posturas se contradicen te dice cuál es cuál y cuál encaja con tu caso.',
  },
  {
    label: 'Cierra con un compromiso',
    detail: 'Una cosa, con fecha, y qué señal contaría como que salió bien.',
  },
  {
    needsTool: true,
    label: 'Busca cuando hace falta',
    detail:
      'Si la respuesta depende de un precio o de qué piden hoy los avisos, lo busca y te nombra la fuente.',
  },
] as const;

export function CoachExplorer({
  onAsk,
  busy,
  canSearch,
}: {
  /** Starts the session on this question. */
  onAsk: (question: string) => void;
  busy: boolean;
  /**
   * Whether the deployment can actually serve a lookup.
   *
   * This list is headed by a promise that every item on it is checkable in one
   * session, and "busca cuando hace falta" was on it whether or not anything
   * could search. A learner who reads that, asks for a current price and is told
   * the teacher cannot look it up has personally disproved the list — on the
   * screen where they are deciding what to ask first, in a product whose fourth
   * promise is that it does not invent.
   *
   * Not shown rather than shown-and-broken. The teacher still answers from what
   * it knows; it simply does not advertise a capability the deployment cannot
   * back.
   */
  canSearch: boolean;
}) {
  const questions = useMemo(
    () =>
      TOPICS.flatMap((topic) =>
        topic.examples.map((question) => ({ question, topic: topic.title })),
      ),
    [],
  );

  return (
    <section className="animate-rise overflow-hidden rounded-lg border border-line bg-surface shadow-sm">
      <header className="flex flex-wrap items-start justify-between gap-3 border-b border-line bg-surface-alt/50 px-5 py-4 sm:px-6">
        <div>
          <h2 className="font-serif text-[22px] font-normal leading-tight tracking-[-0.01em]">
            Empieza por una pregunta real
          </h2>
          <p className="mt-1 text-[13px] leading-relaxed text-muted">
            Toca cualquiera y la sesión arranca hablando de eso, o escribe la tuya arriba.
          </p>
        </div>

      </header>

      <ul className="grid gap-2.5 px-5 py-5 sm:grid-cols-2 sm:px-6">
        {questions.map(({ question, topic }, i) => (
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
          {HOW_IT_ANSWERS.filter((item) => canSearch || !item.needsTool).map((item) => (
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

