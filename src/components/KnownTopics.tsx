'use client';

import { OUT_OF_SCOPE_NOTE, TOPICS } from '@/lib/topics';

/**
 * Sidebar listing what the coach has material for.
 *
 * Discoverability is the point: a voice interface gives no hint of its own
 * scope, so without this the learner has to guess, and a wrong guess costs a
 * whole spoken turn to find out.
 *
 * The examples are tappable because reading them is not the same as knowing
 * what to say out loud. Before the session starts a tap fills the objective
 * field; once connected it sends the question straight into the conversation.
 */
export function KnownTopics({
  onPick,
  connected,
}: {
  onPick: (question: string) => void;
  connected: boolean;
}) {
  return (
    <aside className="rounded-lg border border-[var(--color-line)] bg-[var(--color-surface)] p-4">
      <h2 className="text-sm font-semibold tracking-tight">Sobre esto puedes preguntar</h2>
      <p className="mt-1 text-xs text-gray-500">
        {connected ? 'Toca un ejemplo para enviarlo.' : 'Toca un ejemplo para empezar por ahí.'}
      </p>

      <ul className="mt-4 space-y-5">
        {TOPICS.map((topic) => (
          <li key={topic.title}>
            <h3 className="flex items-center gap-2 text-sm font-medium text-gray-200">
              {topic.title}
              {topic.illustrated && (
                <span
                  title="El coach puede mostrar un tutorial ilustrado en pantalla"
                  className="rounded-full border border-[var(--color-line)] px-1.5 py-0.5 text-[10px] font-normal text-gray-500"
                >
                  con pantalla
                </span>
              )}
            </h3>
            <p className="mt-0.5 text-xs leading-relaxed text-gray-500">{topic.blurb}</p>

            <ul className="mt-2 space-y-1">
              {topic.examples.map((example) => (
                <li key={example}>
                  <button
                    type="button"
                    onClick={() => onPick(example)}
                    className="w-full rounded px-2 py-1 text-left text-xs leading-relaxed text-gray-400 hover:bg-white/5 hover:text-gray-200"
                  >
                    {example}
                  </button>
                </li>
              ))}
            </ul>
          </li>
        ))}
      </ul>

      <p className="mt-5 border-t border-[var(--color-line)] pt-3 text-xs leading-relaxed text-gray-500">
        {OUT_OF_SCOPE_NOTE}
      </p>
    </aside>
  );
}
