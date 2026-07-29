'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { useConversation } from '@elevenlabs/react';
import { TUTORIALS, tutorialById } from '@/lib/tutorials';
import { KnownTopics } from './KnownTopics';
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
  disconnected: 'Sin conectar',
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

  /**
   * A tapped example means something different either side of the connection.
   * Before the session it seeds the objective, which is what gets sent as
   * context on connect; during the session there is nothing to seed, so it goes
   * in as the learner's turn.
   */
  const pickExample = useCallback(
    (question: string) => {
      if (connected) sendUserMessage(question);
      else setObjective(question);
    },
    [connected, sendUserMessage],
  );

  return (
    <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_20rem] lg:items-start xl:grid-cols-[minmax(0,1fr)_24rem] xl:gap-8">
      <div className="space-y-6">
        {/* Session controls */}
        <section className="rounded-lg border border-line bg-surface p-5 shadow-sm sm:p-6">
          <label className="block">
            <span className="mb-2 block text-xs font-semibold uppercase tracking-[0.08em] text-muted">
              Tu objetivo de hoy
            </span>
            <input
              value={objective}
              onChange={(e) => setObjective(e.target.value)}
              placeholder="revertir una versión que falló"
              disabled={connected}
              className="w-full max-w-xl rounded-md border border-field bg-surface px-3.5 py-2.5 text-[15px] text-ink transition-colors duration-150 ease-out placeholder:text-muted hover:border-line-strong focus:border-accent focus:outline-none focus:ring-4 focus:ring-accent-soft disabled:bg-surface-alt disabled:text-muted"
            />
          </label>

          <div className="mt-5 flex flex-wrap items-center gap-3">
            {connected ? (
              <button
                onClick={() => void endSession()}
                className="rounded-md bg-danger px-5 py-2.5 text-sm font-semibold text-white shadow-sm transition duration-150 ease-out hover:brightness-110"
              >
                Terminar sesión
              </button>
            ) : (
              <button
                onClick={() => void start()}
                disabled={starting || status === 'connecting'}
                className="rounded-md bg-accent px-6 py-2.5 text-sm font-semibold text-white shadow-sm transition duration-150 ease-out hover:-translate-y-px hover:bg-accent-hover hover:shadow-md disabled:translate-y-0 disabled:opacity-55 disabled:shadow-sm"
              >
                {starting || status === 'connecting' ? 'Conectando…' : 'Empezar a hablar'}
              </button>
            )}

            <StatusPill connected={connected} isSpeaking={isSpeaking} status={status} />
          </div>

          {!connected && (
            <p className="mt-3 text-xs text-muted">
              Se pedirá permiso para usar el micrófono. Si prefieres escribir, puedes
              hacerlo una vez empezada la sesión.
            </p>
          )}
        </section>

        {error && (
          <p
            role="alert"
            className="flex items-start gap-2.5 rounded-md border border-danger/25 bg-danger-soft/60 px-4 py-3 text-sm text-danger"
          >
            <span aria-hidden className="mt-px font-semibold">
              !
            </span>
            <span className="text-ink/85">{error}</span>
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

        <Transcript turns={turns} scrollRef={transcriptRef} />

        {connected && <TextFallback onSend={sendUserMessage} />}
      </div>

      <KnownTopics onPick={pickExample} connected={connected} />
    </div>
  );
}

/**
 * Connection state, said in words as well as colour.
 *
 * The dot alone would encode the whole state in hue, which is exactly the thing
 * a colour-blind learner cannot read.
 */
function StatusPill({
  connected,
  isSpeaking,
  status,
}: {
  connected: boolean;
  isSpeaking: boolean;
  status: string;
}) {
  const label = connected
    ? isSpeaking
      ? 'El coach está hablando'
      : 'Te escucha'
    : STATUS_ES[status] ?? status;

  return (
    <span
      aria-live="polite"
      className={`inline-flex items-center gap-2 rounded-full border px-3 py-1.5 text-xs font-medium ${
        connected
          ? 'border-success/25 bg-success-soft/70 text-success'
          : 'border-line bg-surface-alt text-muted'
      }`}
    >
      <span
        aria-hidden
        className={`h-2 w-2 rounded-full ${
          connected ? (isSpeaking ? 'animate-pulse bg-accent' : 'bg-success') : 'bg-subtle'
        }`}
      />
      {label}
    </span>
  );
}

/** The conversation so far, as chat rows. */
function Transcript({
  turns,
  scrollRef,
}: {
  turns: Turn[];
  scrollRef: React.RefObject<HTMLDivElement | null>;
}) {
  return (
    <section
      aria-label="Transcripción de la conversación"
      ref={scrollRef}
      className={`scroll-soft overflow-y-auto rounded-lg border border-line bg-surface-alt/60 p-4 transition-[height] duration-300 ease-out sm:p-5 ${
        // Empty, this box is just a hole in the page. It earns its height once
        // there is something in it.
        turns.length === 0 ? 'h-56' : 'h-96 xl:h-[32rem]'
      }`}
    >
      {turns.length === 0 ? (
        <div className="flex h-full flex-col items-center justify-center gap-2 text-center">
          <span
            aria-hidden
            className="flex h-11 w-11 items-center justify-center rounded-full bg-accent-soft text-accent ring-4 ring-surface"
          >
            <svg
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="1.75"
              strokeLinecap="round"
              strokeLinejoin="round"
              className="h-5 w-5"
            >
              <path d="M12 3a3 3 0 0 0-3 3v6a3 3 0 0 0 6 0V6a3 3 0 0 0-3-3Z" />
              <path d="M5 11a7 7 0 0 0 14 0" />
              <path d="M12 18v3" />
            </svg>
          </span>
          <p className="text-sm font-medium text-muted">Aquí aparecerá la conversación</p>
          <p className="max-w-xs text-xs leading-relaxed text-muted">
            Empieza la sesión y cuéntale en qué estás trabajando. Puedes interrumpirle
            cuando quieras.
          </p>
        </div>
      ) : (
        <ul className="mx-auto max-w-3xl space-y-3">
          {turns.map((turn, i) => (
            <li
              key={i}
              className={`animate-rise flex ${turn.role === 'user' ? 'justify-end' : 'justify-start'}`}
            >
              <div
                className={`max-w-[85%] rounded-lg px-4 py-2.5 text-sm leading-relaxed ${
                  turn.role === 'user'
                    ? 'bg-accent text-white'
                    : 'border border-line bg-surface text-ink shadow-sm'
                }`}
              >
                <span
                  className={`mb-0.5 block text-[11px] font-semibold uppercase tracking-[0.06em] ${
                    turn.role === 'user' ? 'text-white/75' : 'text-accent'
                  }`}
                >
                  {turn.role === 'user' ? 'Tú' : 'Coach'}
                </span>
                {turn.text}
              </div>
            </li>
          ))}
        </ul>
      )}
    </section>
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
      <label className="sr-only" htmlFor="fallback">
        Escribe tu pregunta
      </label>
      <input
        id="fallback"
        value={value}
        onChange={(e) => setValue(e.target.value)}
        placeholder="O escribe tu pregunta…"
        className="flex-1 rounded-md border border-field bg-surface px-3.5 py-2.5 text-sm text-ink transition-colors duration-150 ease-out placeholder:text-muted hover:border-line-strong focus:border-accent focus:outline-none focus:ring-4 focus:ring-accent-soft"
      />
      <button className="rounded-md border border-line bg-surface px-5 py-2.5 text-sm font-semibold text-ink shadow-sm transition duration-150 ease-out hover:border-line-strong hover:shadow-md">
        Enviar
      </button>
    </form>
  );
}
