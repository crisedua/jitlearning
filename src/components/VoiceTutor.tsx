'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { useConversation } from '@elevenlabs/react';
import { TUTORIALS, tutorialById } from '@/lib/tutorials';
import { TutorialPanel } from './TutorialPanel';

interface Turn {
  role: 'user' | 'agent';
  text: string;
}

/**
 * The SDK reports connection status in English. Anything unmapped falls through
 * to the raw value rather than rendering blank — a new status the SDK adds
 * should look untranslated, not missing.
 */
const STATUS_ES: Record<string, string> = {
  disconnected: 'Desconectado',
  connecting: 'Conectando…',
  connected: 'Conectado',
  disconnecting: 'Desconectando…',
};

/** What the agent is showing on screen right now. */
interface Showing {
  id: string;
  step: number;
}

/**
 * Voice interface to the tutor agent.
 *
 * The browser never sees the ElevenLabs API key: it asks `/api/signed-url` for
 * a short-lived signed WebSocket URL and connects with that.
 *
 * The agent can also drive the page. It has one client tool, `mostrar_tutorial`,
 * which opens the step-by-step panel and moves through it while it talks — so
 * spoken instructions and the diagram on screen stay on the same step.
 */
export function VoiceTutor() {
  const [turns, setTurns] = useState<Turn[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [objective, setObjective] = useState('');
  const [starting, setStarting] = useState(false);
  const [showing, setShowing] = useState<Showing | null>(null);
  const transcriptRef = useRef<HTMLDivElement>(null);

  const conversation = useConversation({
    onConnect: () => setError(null),
    onMessage: ({ message, source }: { message: string; source: string }) => {
      setTurns((prev) => [
        ...prev,
        { role: source === 'user' ? 'user' : 'agent', text: message },
      ]);
    },
    onError: (message: string) => setError(message),
    clientTools: {
      /**
       * Called by the agent, not by the UI.
       *
       * The return value goes back into the conversation, so it is written for
       * the model to act on: an unknown id returns the list of real ones rather
       * than failing silently, which is what stops the agent from narrating a
       * tutorial the learner cannot see.
       */
      mostrar_tutorial: ({
        tutorial_id,
        paso,
      }: {
        tutorial_id?: string;
        paso?: number | string;
      }) => {
        const tutorial = tutorial_id ? tutorialById(tutorial_id) : undefined;
        if (!tutorial) {
          return `No existe un tutorial con ese identificador. Los disponibles son: ${TUTORIALS.map(
            (t) => t.id,
          ).join(', ')}. No anuncies un tutorial que no esté en esa lista.`;
        }

        // The model sends 1-based step numbers, and sometimes as a string.
        const asNumber = typeof paso === 'string' ? Number.parseInt(paso, 10) : paso;
        const requested = Number.isFinite(asNumber) ? (asNumber as number) : 1;
        const index = Math.min(Math.max(requested, 1), tutorial.steps.length) - 1;

        setShowing({ id: tutorial.id, step: index });
        return `En pantalla: "${tutorial.title}", paso ${index + 1} de ${
          tutorial.steps.length
        } (${tutorial.steps[index]!.title}).`;
      },
    },
  });

  const { status, isSpeaking, startSession, endSession, sendUserMessage } = conversation;
  const connected = status === 'connected';

  useEffect(() => {
    transcriptRef.current?.scrollTo({ top: transcriptRef.current.scrollHeight });
  }, [turns]);

  const start = useCallback(async () => {
    setStarting(true);
    setError(null);
    try {
      // Must originate from a user gesture, or the browser rejects it.
      await navigator.mediaDevices.getUserMedia({ audio: true });

      const res = await fetch('/api/signed-url');
      const data = (await res.json()) as { signedUrl?: string; error?: string };
      if (!res.ok || !data.signedUrl) {
        throw new Error(data.error ?? 'No se pudo conectar con el coach.');
      }

      setTurns([]);
      setShowing(null);
      await startSession({ signedUrl: data.signedUrl, connectionType: 'websocket' });

      // Seed the agent with the learner's goal without spending a spoken turn.
      if (objective.trim()) {
        conversation.sendContextualUpdate(
          `Objetivo declarado para esta sesión: ${objective.trim()}`,
        );
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'No se pudo iniciar la sesión.');
    } finally {
      setStarting(false);
    }
  }, [startSession, conversation, objective]);

  const shownTutorial = showing ? tutorialById(showing.id) : undefined;

  return (
    <div className="space-y-6">
      <label className="block max-w-xl">
        <span className="mb-1.5 block text-xs font-medium uppercase tracking-wide text-gray-500">
          ¿Con qué te has atascado?
        </span>
        <input
          value={objective}
          onChange={(e) => setObjective(e.target.value)}
          placeholder="revertir una versión que falló"
          disabled={connected}
          className="w-full rounded-md border border-[var(--color-line)] bg-[var(--color-surface)] px-3 py-2 text-sm outline-none focus:border-[var(--color-accent)] disabled:opacity-50"
        />
      </label>

      <div className="flex items-center gap-4">
        {connected ? (
          <button
            onClick={() => void endSession()}
            className="rounded-md bg-red-600 px-5 py-2.5 text-sm font-medium hover:bg-red-500"
          >
            Terminar sesión
          </button>
        ) : (
          <button
            onClick={() => void start()}
            disabled={starting || status === 'connecting'}
            className="rounded-md bg-[var(--color-accent)] px-5 py-2.5 text-sm font-medium disabled:opacity-50 hover:brightness-110"
          >
            {starting || status === 'connecting' ? 'Conectando…' : 'Empezar'}
          </button>
        )}

        <span className="flex items-center gap-2 text-sm text-gray-400">
          <span
            aria-hidden
            className={`h-2.5 w-2.5 rounded-full ${
              connected
                ? isSpeaking
                  ? 'animate-pulse bg-[var(--color-accent)]'
                  : 'bg-emerald-500'
                : 'bg-gray-600'
            }`}
          />
          {connected
            ? isSpeaking
              ? 'El coach está hablando'
              : 'Escuchando'
            : STATUS_ES[status] ?? status}
        </span>
      </div>

      {error && (
        <p className="rounded-md border border-red-900 bg-red-950/50 px-4 py-3 text-sm text-red-300">
          {error}
        </p>
      )}

      {shownTutorial && showing && (
        <TutorialPanel
          tutorial={shownTutorial}
          step={showing.step}
          onStep={(step) => setShowing({ id: shownTutorial.id, step })}
          onClose={() => setShowing(null)}
        />
      )}

      <section
        ref={transcriptRef}
        className="h-80 overflow-y-auto rounded-lg border border-[var(--color-line)] bg-[var(--color-surface)] p-4"
      >
        {turns.length === 0 ? (
          <p className="text-sm text-gray-500">
            La transcripción aparecerá aquí cuando empiece la sesión.
          </p>
        ) : (
          <ul className="space-y-3">
            {turns.map((turn, i) => (
              <li key={i} className="text-sm">
                <span
                  className={
                    turn.role === 'user'
                      ? 'font-medium text-gray-400'
                      : 'font-medium text-[var(--color-accent)]'
                  }
                >
                  {turn.role === 'user' ? 'Tú' : 'Coach'}:{' '}
                </span>
                <span className="text-gray-200">{turn.text}</span>
              </li>
            ))}
          </ul>
        )}
      </section>

      {connected && <TextFallback onSend={sendUserMessage} />}
    </div>
  );
}

/** Typing fallback for noisy rooms or when the mic misfires. */
function TextFallback({ onSend }: { onSend: (text: string) => void }) {
  const [value, setValue] = useState('');
  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        const text = value.trim();
        if (!text) return;
        onSend(text);
        setValue('');
      }}
      className="flex gap-2"
    >
      <input
        value={value}
        onChange={(e) => setValue(e.target.value)}
        placeholder="O escribe tu pregunta…"
        className="flex-1 rounded-md border border-[var(--color-line)] bg-[var(--color-surface)] px-3 py-2 text-sm outline-none focus:border-[var(--color-accent)]"
      />
      <button className="rounded-md border border-[var(--color-line)] px-4 py-2 text-sm hover:border-gray-500">
        Enviar
      </button>
    </form>
  );
}
