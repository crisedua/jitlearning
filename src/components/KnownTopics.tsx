'use client';

import { TOPICS } from '@/lib/topics';

/**
 * Sidebar listing what the teacher can be asked.
 *
 * Discoverability is the point: a voice interface gives no hint of its own
 * scope, so without this the learner has to guess, and a wrong guess costs a
 * whole spoken turn to find out.
 *
 * The examples are tappable because reading them is not the same as knowing
 * what to say out loud. Before the session starts a tap fills the objective
 * field; once connected it sends the question straight into the conversation.
 *
 * Deliberately *not* the same action as the explorer above, which starts the
 * session on the question tapped. This is the browsing surface and stays
 * consequence-free: a tap here should never open a microphone or spend a
 * billable minute by surprise, so the hint text says which of the two it is.
 */
export function KnownTopics({
  onPick,
  connected,
}: {
  onPick: (question: string) => void;
  connected: boolean;
}) {
  const topics = TOPICS;

  return (
    <aside className="overflow-hidden rounded-lg border border-line bg-surface shadow-sm lg:sticky lg:top-20">
      <div className="border-b border-line bg-surface-alt/60 px-5 py-4">
        <h2 className="text-sm font-semibold tracking-tight">Sobre esto puedes preguntar</h2>
        <p className="mt-1 text-xs leading-relaxed text-muted">
          {connected
            ? 'Toca un ejemplo para enviarlo a la conversación.'
            : 'Toca un ejemplo para dejarlo como objetivo, sin empezar todavía.'}
        </p>
      </div>

      <ul className="divide-y divide-line">
        {topics.map((topic) => (
          <li key={topic.title} className="px-5 py-4">
            <h3 className="text-sm font-semibold text-ink">{topic.title}</h3>
            <p className="mt-1 text-xs leading-relaxed text-muted">{topic.blurb}</p>

            <ul className="mt-2.5 space-y-1">
              {topic.examples.map((example) => (
                <li key={example}>
                  <button
                    type="button"
                    onClick={() => onPick(example)}
                    className="group flex w-full items-start gap-2 rounded-md px-2 py-1.5 text-left text-xs leading-relaxed text-muted transition-colors duration-150 ease-out hover:bg-accent-soft/50 hover:text-accent-hover"
                  >
                    <span
                      aria-hidden
                      className="mt-px text-muted transition-colors duration-150 ease-out group-hover:text-accent"
                    >
                      →
                    </span>
                    <span className="min-w-0">{example}</span>
                  </button>
                </li>
              ))}
            </ul>
          </li>
        ))}
      </ul>

      <p className="border-t border-line bg-surface-alt/60 px-5 py-3.5 text-xs leading-relaxed text-muted">
        Puedes preguntarle lo que quieras de tu trabajo y la IA. Lo que no tiene es internet:
        precios, ofertas y noticias de hoy no las puede ver.
      </p>
    </aside>
  );
}
