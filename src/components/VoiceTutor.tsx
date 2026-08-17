'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { ConversationProvider, useConversation } from '@elevenlabs/react';
import { KnownTopics } from './KnownTopics';
import { CoachExplorer } from './CoachExplorer';

interface Turn {
  role: 'user' | 'agent';
  text: string;
}

/**
 * Today's date, written the way the coach will say it out loud.
 *
 * The weekday is included deliberately: deadlines in conversation are named by
 * day ("antes del viernes"), and the coach cannot work out that Friday is three
 * days away from a numeric date alone.
 */
function todayInSpanish(): string {
  return new Date().toLocaleDateString('es-ES', {
    weekday: 'long',
    day: 'numeric',
    month: 'long',
    year: 'numeric',
  });
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
  error: 'Error de conexión',
};

/**
 * Voice interface to the tutor agent.
 *
 * The browser never sees the ElevenLabs API key: it asks `/api/signed-url` for
 * a short-lived signed WebSocket URL and connects with that.
 *
 * The SDK's `useConversation` must live under a `ConversationProvider`, so the
 * exported component is just that wrapper around the real one.
 */
export function VoiceTutor() {
  return (
    <ConversationProvider>
      <VoiceTutorInner />
    </ConversationProvider>
  );
}

function VoiceTutorInner() {
  const [turns, setTurns] = useState<Turn[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [objective, setObjective] = useState('');
  const [starting, setStarting] = useState(false);
  const transcriptRef = useRef<HTMLDivElement>(null);

  /*
   * Usage bookkeeping. Refs rather than state: none of it is rendered, and the
   * report has to be readable from an event that fires while the page is being
   * torn down, when a re-render will never come.
   */
  const usageRef = useRef<{
    sessionId: string | null;
    conversationId: string | null;
    startedAt: number;
    messages: number;
  }>({ sessionId: null, conversationId: null, startedAt: 0, messages: 0 });

  /*
   * Two refs that keep the visible chat honest with the audio:
   *
   * `pendingContextRef` holds the contextual update (date, objective, memory)
   * composed at start time — the new SDK's `startSession` no longer resolves
   * when the socket opens, so the send has to wait for the `connected` status.
   *
   * `lastTypedRef` is the last message sent as text. Typed messages are not
   * echoed back by the server the way spoken ones are transcribed, so they are
   * appended to the transcript locally at send time — and if a server echo for
   * the same text ever does arrive, this ref is how it gets deduplicated
   * instead of showing twice.
   */
  const pendingContextRef = useRef<string | null>(null);
  const lastTypedRef = useRef<string | null>(null);

  /**
   * Tell the server the conversation is over, so its usage row can be closed.
   *
   * Fires at most once per session — `sessionId` is cleared as it goes out,
   * because both a normal disconnect and the page unloading can reach here for
   * the same session. `keepalive` is what lets the request outlive the page.
   *
   * Failure is silent on purpose: the learner has finished talking and can do
   * nothing about it, and `npm run sync:usage` reconciles missed rows against
   * ElevenLabs afterwards.
   */
  const reportUsage = useCallback(() => {
    const usage = usageRef.current;
    if (!usage.sessionId) return;

    const sessionId = usage.sessionId;
    usage.sessionId = null;

    const body = JSON.stringify({
      conversationId: usage.conversationId ?? undefined,
      durationSeconds: usage.startedAt
        ? Math.round((Date.now() - usage.startedAt) / 1000)
        : undefined,
      messageCount: usage.messages,
    });

    void fetch(`/api/sessions/${sessionId}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body,
      keepalive: true,
    }).catch(() => {});
  }, []);

  const conversation = useConversation({
    onConnect: ({ conversationId }: { conversationId: string }) => {
      // The id ElevenLabs bills under. Without it a usage row cannot be
      // reconciled against their side later.
      usageRef.current.conversationId = conversationId;
      setError(null);
    },
    onDisconnect: () => reportUsage(),
    onMessage: ({ message, source }: { message: string; source: string }) => {
      // A typed message already went into the transcript at send time; if the
      // server echoes it back, showing it again would double it.
      if (source === 'user' && message === lastTypedRef.current) {
        lastTypedRef.current = null;
        return;
      }
      usageRef.current.messages += 1;
      setTurns((prev) => [
        ...prev,
        { role: source === 'user' ? 'user' : 'agent', text: message },
      ]);
    },
    /*
     * The transcript shows the full response the moment the coach starts
     * speaking; when the learner interrupts, the voice stops mid-sentence but
     * the full text would stay on screen — the reader and the listener walk
     * away with different conversations. The correction event carries what was
     * actually said out loud; the last agent bubble is rewritten to match it.
     */
    onAgentResponseCorrection: (event: { corrected_agent_response: string }) => {
      const corrected = event.corrected_agent_response;
      if (!corrected) return;
      setTurns((prev) => {
        for (let i = prev.length - 1; i >= 0; i--) {
          if (prev[i]!.role === 'agent') {
            const next = [...prev];
            next[i] = { role: 'agent', text: corrected };
            return next;
          }
        }
        return prev;
      });
    },
    onError: (message: string) => setError(message),
  });

  // A closed tab is the most common way a session ends. `pagehide` is the last
  // event that reliably fires for it, including on iOS, where `beforeunload`
  // does not.
  useEffect(() => {
    const onHide = () => reportUsage();
    window.addEventListener('pagehide', onHide);
    return () => {
      window.removeEventListener('pagehide', onHide);
      reportUsage();
    };
  }, [reportUsage]);

  const { status, isSpeaking, startSession, endSession, sendUserMessage, sendContextualUpdate } =
    conversation;
  const connected = status === 'connected';

  useEffect(() => {
    transcriptRef.current?.scrollTo({ top: transcriptRef.current.scrollHeight });
  }, [turns]);

  /*
   * Seed the agent without spending a spoken turn, as soon as the socket is
   * actually open. `startSession` returns before connecting, so this cannot
   * happen inline in `start` anymore — the context waits in the ref and goes
   * out exactly once per session.
   */
  useEffect(() => {
    if (status !== 'connected') return;
    const context = pendingContextRef.current;
    if (context) {
      pendingContextRef.current = null;
      sendContextualUpdate(context);
    }
  }, [status, sendContextualUpdate]);

  // `starting` covers the gap between the click and the SDK taking over;
  // any settled status — open, failed, or closed — means that gap is over.
  useEffect(() => {
    if (status !== 'connecting') setStarting(false);
  }, [status]);

  /**
   * `seed` is the question tapped in the explorer.
   *
   * Passed as an argument rather than read from state: a tap sets the objective
   * and starts the session in the same handler, and the state update from that
   * tap has not been applied yet by the time this runs. Reading `objective`
   * here would send the *previous* objective as context, or none at all.
   */
  const start = useCallback(
    async (seed?: string) => {
    setStarting(true);
    setError(null);
    try {
      // Must originate from a user gesture, or the browser rejects it.
      await navigator.mediaDevices.getUserMedia({ audio: true });

      const res = await fetch('/api/signed-url');
      // The session expired while the page stayed open. Nothing here can
      // recover it, so send them back through Google rather than showing an
      // error about a credential they cannot renew from this screen.
      if (res.status === 401) {
        window.location.href = `/auth/login?next=${encodeURIComponent('/coach')}`;
        return;
      }

      const data = (await res.json()) as {
        signedUrl?: string;
        sessionId?: string | null;
        /** Memory of previous sessions, composed server-side. Null on a first visit. */
        context?: string | null;
        /**
         * The agent's `{{apertura}}`, `{{registro}}` and `{{primera_sesion}}`.
         * The prompt references all three, so a session started without them
         * fails outright: this is not optional decoration.
         */
        dynamicVariables?: Record<string, string>;
        error?: string;
      };
      if (!res.ok || !data.signedUrl) {
        throw new Error(data.error ?? 'No se pudo conectar con el profesor.');
      }

      setTurns([]);
      lastTypedRef.current = null;
      usageRef.current = {
        // Null when this deployment records no usage. Everything downstream
        // checks for it rather than assuming a row exists.
        sessionId: data.sessionId ?? null,
        conversationId: null,
        startedAt: Date.now(),
        messages: 0,
      };

      // Composed now, sent by the effect above once the socket opens.
      //
      // The date is not decoration. The persona closes each stretch of
      // conversation on a commitment with a deadline, and a model has no clock:
      // left to itself it either invents a date or retreats to "esta semana",
      // which is the vagueness the commitment exists to remove. Sent from the
      // browser, so it is the learner's own calendar day rather than the
      // server's timezone.
      //
      // `data.context` is the server-composed memory of previous sessions —
      // what lets someone log out, come back, and be asked how their committed
      // action went instead of starting from zero.
      const goal = (seed ?? objective).trim();
      pendingContextRef.current = [
        `Hoy es ${todayInSpanish()}. Úsalo para fijar plazos y para contar los días que faltan.`,
        goal && `Objetivo declarado para esta sesión: ${goal}`,
        data.context,
      ]
        .filter(Boolean)
        .join('\n\n');

      // Fire-and-forget in the new SDK: success arrives as status 'connected',
      // failure through onError — `starting` is cleared by the status effect.
      startSession({
        signedUrl: data.signedUrl,
        connectionType: 'websocket',
        dynamicVariables: data.dynamicVariables,
      });
    } catch (err) {
      setError(err instanceof Error ? err.message : 'No se pudo iniciar la sesión.');
      setStarting(false);
    }
    },
    [startSession, objective],
  );

  /**
   * Send a message as text — typed in the fallback box or tapped on a card.
   *
   * The server transcribes *spoken* turns back through `onMessage`, but a
   * typed message gets no such echo, so without this the coach would visibly
   * answer a question that never appeared on screen. It goes into the
   * transcript here, at send time, and `lastTypedRef` guards against a double
   * if the server ever starts echoing typed text too.
   */
  const sendTyped = useCallback(
    (text: string) => {
      lastTypedRef.current = text;
      usageRef.current.messages += 1;
      setTurns((prev) => [...prev, { role: 'user', text }]);
      sendUserMessage(text);
    },
    [sendUserMessage],
  );

  /**
   * One tap from a question to a conversation about it.
   *
   * Before connecting, the tapped question becomes the objective *and* starts
   * the session. Mid-session there is nothing to seed, so it goes in as the
   * learner's own turn instead.
   */
  const askAndStart = useCallback(
    (question: string) => {
      setObjective(question);
      if (connected) sendTyped(question);
      else void start(question);
    },
    [connected, sendTyped, start],
  );

  /**
   * A tapped example means something different either side of the connection.
   * Before the session it seeds the objective, which is what gets sent as
   * context on connect; during the session there is nothing to seed, so it goes
   * in as the learner's turn.
   */
  const pickExample = useCallback(
    (question: string) => {
      if (connected) sendTyped(question);
      else setObjective(question);
    },
    [connected, sendTyped],
  );

  return (
    <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_20rem] lg:items-start xl:grid-cols-[minmax(0,1fr)_24rem] xl:gap-8">
      <div className="space-y-6">
        {/*
          Session controls first, directly under the page heading.

          The explorer below is worth reading, but it is not the reason anyone
          came: pushing the button that starts the conversation below a screen
          of question cards hides the primary action behind the thing meant to
          feed it. Same wording as the header call to action on purpose — they
          are the same action, and a second name for it reads as a second thing.
        */}
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
                className="rounded-full bg-danger px-6 py-2.5 text-[15px] font-medium text-white shadow-sm transition duration-150 ease-out hover:brightness-110"
              >
                Terminar sesión
              </button>
            ) : (
              <button
                onClick={() => void start()}
                disabled={starting || status === 'connecting'}
                className="inline-flex items-center gap-2.5 rounded-full bg-accent px-6 py-2.5 text-[15px] font-medium text-white shadow-sm transition duration-200 ease-out hover:-translate-y-0.5 hover:bg-accent-hover hover:shadow-md disabled:translate-y-0 disabled:opacity-55 disabled:shadow-sm"
              >
                {starting || status === 'connecting' ? 'Conectando…' : 'Empezar la clase'}
                <span
                  aria-hidden
                  className="h-[7px] w-[7px] rounded-full bg-gold [animation:ring_2.2s_ease-out_infinite]"
                />
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

        {/*
          Before the session only. Once the transcript is live this would
          compete with it for the same attention, and the sidebar covers the
          same ground for anyone who needs a prompt mid-conversation.
        */}
        {!connected && (
          <CoachExplorer onAsk={askAndStart} busy={starting || status === 'connecting'} />
        )}

        {error && (
          <p
            role="alert"
            className="flex flex-wrap items-start gap-2.5 rounded-md border border-danger/25 bg-danger-soft/60 px-4 py-3 text-sm text-danger"
          >
            <span aria-hidden className="mt-px font-semibold">
              !
            </span>
            <span className="text-ink/85">{error.replace(' en /planes', '')}</span>
            {/*
              The plan gate is the one error with somewhere to go. The message
              comes from the server, which cannot render a link, so the mention
              of /planes is turned into one here and stripped from the prose
              above rather than being read twice.
            */}
            {error.includes('/planes') && (
              <a
                href="/planes"
                className="font-semibold text-accent underline underline-offset-2 hover:text-accent-hover"
              >
                Ver los planes
              </a>
            )}
          </p>
        )}

        <Transcript turns={turns} scrollRef={transcriptRef} />

        {connected && <TextFallback onSend={sendTyped} />}

        {/*
          After the call, not during it. The plan and the evidence live on the
          progress page, and the moment somebody has just promised to do
          something is the moment to point at where it is written down. Shown
          only once there was a real conversation, so it never reads as an
          instruction to leave before starting.
        */}
        {!connected && turns.length > 0 && <AfterSession />}
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
          connected ? (isSpeaking ? 'animate-pulse bg-accent' : 'bg-success') : 'bg-soft'
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
                  {turn.role === 'user' ? 'Tú' : 'Profesor'}
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

/**
 * Where the session goes next.
 *
 * Voice cannot hand anybody a plan: eleven steps read aloud is nothing anyone
 * retains. This is the handoff from the classroom to the notebook.
 */
function AfterSession() {
  return (
    <section className="animate-rise rounded-lg border border-gold/35 bg-gold-soft/30 px-5 py-4">
      <h2 className="text-[15px] font-semibold">La clase terminó. Lo hablado quedó escrito.</h2>
      <p className="mt-1.5 text-[14px] leading-relaxed text-ink/85">
        Tu plan, el paso en el que vas y lo que te comprometiste a hacer están en tu página de
        progreso. Ahí puedes marcar lo que cumpliste y describir qué construiste.
      </p>
      <a
        href="/progreso"
        className="mt-3 inline-flex items-center gap-1.5 text-[14px] font-medium text-accent transition-colors duration-150 ease-out hover:text-accent-hover"
      >
        Ver tu plan
        <span aria-hidden>→</span>
      </a>
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
