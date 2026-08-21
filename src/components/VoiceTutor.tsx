'use client';

import { wrapUpAt } from '@/lib/class-length';
import { micMessage } from '@/lib/mic';
import { liveCallMessage } from '@/lib/errors';
import { useCallback, useEffect, useRef, useState } from 'react';
import { ConversationProvider, useConversation } from '@elevenlabs/react';
import { PracticeBench } from './PracticeBench';
import {
  benchFailureUpdate,
  benchUpdate,
  DEFAULT_MODEL,
  practiceModel,
  resolveModel,
  SANDBOX_TOOL,
  type PracticeModelId,
} from '@/lib/practica';
import { CoachExplorer } from './CoachExplorer';
import { offersUpgrade, withoutUpgradeMarker } from '@/lib/gate';

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
export function VoiceTutor({ canSearch }: { canSearch: boolean }) {
  return (
    <ConversationProvider>
      <VoiceTutorInner canSearch={canSearch} />
    </ConversationProvider>
  );
}

function VoiceTutorInner({ canSearch }: { canSearch: boolean }) {
  const [turns, setTurns] = useState<Turn[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [objective, setObjective] = useState('');
  const [starting, setStarting] = useState(false);
  const transcriptRef = useRef<HTMLDivElement>(null);

  /*
   * The usage row this class opened, for the practice bench to charge against.
   *
   * A second home for something `usageRef` already holds, and deliberately so:
   * that ref is nulled the moment usage is reported, because it doubles as the
   * "already sent" flag for a report that must fire exactly once. The bench
   * needs the id for as long as the class is open, and reading it from a ref
   * that clears itself would silently start writing practice rows with no
   * session attached partway through a session.
   */
  const [benchSession, setBenchSession] = useState<string | null>(null);

  /*
   * The bench opens when the teacher opens it, not whenever there is a call.
   *
   * It used to render for every connected session, which put a chat panel in
   * front of somebody who had just said they were walking, and left the model
   * choice to a learner who is here precisely because they do not yet know the
   * difference. Now the teacher decides — it knows whether there is a screen,
   * what the exercise is, and which assistant fits — and fires
   * `open_model_sandbox` when the class reaches the doing part.
   *
   * `null` is closed. Kept as one object so opening on a new model and a new
   * task is a single render.
   */
  const [bench, setBench] = useState<{ model: PracticeModelId; task: string | null } | null>(null);

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
  /**
   * Minutes of allowance left when this session opened.
   *
   * A ref rather than state: the timers read it once at connect and nothing
   * renders it, so putting it in state would re-render the transcript for a
   * number nobody sees.
   */
  const minutesLeftRef = useRef<number | null>(null);
  const lastTypedRef = useRef<string | null>(null);

  /**
   * Tell the server the conversation is over, so its usage row can be closed.
   *
   * Fires at most once per session — `sessionId` is cleared as it goes out,
   * because both a normal disconnect and the page unloading can reach here for
   * the same session. `keepalive` is what lets the request outlive the page.
   *
   * Failure is silent on purpose: the learner has finished talking and can do
   * nothing about it.
   *
   * This used to add that `npm run sync:usage` reconciles missed rows
   * afterwards, which was not true of the case that matters. That script
   * matches rows to conversations by `conversation_id`, so a row that lost this
   * report has nothing to match on and is counted as unmatched. The id is now
   * written at connect time as well, which is what makes the sentence above
   * survivable at all.
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

    /*
     * `sendBeacon` first, and `fetch` only when it is missing.
     *
     * This ran on `fetch` with `keepalive: true`, which is the modern answer and
     * the one iOS Safari was slowest to honour. The event above was already
     * chosen for iOS — `pagehide`, because `beforeunload` does not fire there —
     * and then the request it fires was left on the transport that browser is
     * worst at keeping alive through a page teardown.
     *
     * What is lost when it does not survive is not a metric. This request
     * carries the conversation id, which is what ties the class to the summary
     * the post-call webhook writes, and the duration the allowance is counted
     * from. Losing it means a learner who closed the tab gets no memory of that
     * class and no minutes deducted, and the closed tab is, by the comment above,
     * the most common way a session ends.
     *
     * The endpoint needs no custom header — it authenticates by cookie, and a
     * beacon sends those — so the Blob's type carries the only thing `fetch` was
     * setting.
     */
    const url = `/api/sessions/${sessionId}`;
    const blob = new Blob([body], { type: 'application/json' });

    if (navigator.sendBeacon?.(url, blob)) return;

    void fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body,
      keepalive: true,
    }).catch(() => {});
  }, []);

  const conversation = useConversation({
    /*
     * The tools the browser runs on the teacher's behalf.
     *
     * A *client* tool: ElevenLabs relays the call over the open socket, nothing
     * runs on our server, and the panel appears while the teacher is still
     * mid-sentence. A webhook tool could not do this — the server has no way to
     * reach into this page.
     *
     * The return value is spoken back into the model's context, so it is
     * written as a fact the teacher can act on rather than as a status code. It
     * matters most when the model is not one we serve: the panel still opens,
     * on the default, and the teacher is told which one it actually got so it
     * does not spend the next turn saying "Claude" at somebody looking at
     * Gemini.
     */
    clientTools: {
      [SANDBOX_TOOL.name]: ({ model, task }: { model?: string; task?: string }) => {
        const picked = resolveModel(model);
        const chosen = picked?.id ?? DEFAULT_MODEL;
        setBench({ model: chosen, task: task?.trim() || null });

        const label = practiceModel(chosen)!.label;
        return picked
          ? `Listo, el banco de práctica está abierto con ${label} en la pantalla del alumno.`
          : `No tengo "${model ?? 'ese'}" en el banco. Lo abrí con ${label}, que es de los que hay. Dile con cuál está trabajando.`;
      },
    },
    onConnect: ({ conversationId }: { conversationId: string }) => {
      // The id ElevenLabs bills under, and the only key the post-call webhook
      // has for working out whose class this was.
      usageRef.current.conversationId = conversationId;
      setError(null);

      /*
       * Reported now, not only in the beacon at teardown.
       *
       * The beacon was the single carrier of this id, and it fires while the
       * page is being dismantled — so a dropped connection took the id with it,
       * the webhook could not match the transcript to anybody, and the learner
       * was told their class had not been saved. `sync:usage` matches on the
       * same column, so it could not repair it either.
       *
       * Fire-and-forget on purpose: the class is starting and there is nothing
       * useful to say to somebody about a bookkeeping write. The beacon still
       * carries the same id, so this is a second chance rather than a swap.
       */
      const sessionId = usageRef.current.sessionId;
      if (sessionId) {
        void fetch(`/api/sessions/${sessionId}`, {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ conversationId }),
        }).catch(() => {});
      }
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
    onError: (message: string) => {
      // The original goes where somebody who can act on it will look; the
      // learner gets the one move available to them. See `liveCallMessage`.
      console.error('[clase] live session error:', message);
      setError(liveCallMessage(message));
    },
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

  /*
   * Tell the teacher when time is running out, because it cannot tell.
   *
   * The record it opens on says how many minutes are left, and the persona is
   * instructed to skip the map and spend what remains finishing the task and
   * measuring it. Both are read once, at connect, by a model with no clock: it
   * knows what it started with and never learns how much has gone. So the instruction that protects the most important outcome of a first
   * session could only ever fire on the value it was handed at the start.
   *
   * The gate is at connect too, so a running session is never cut off. A first
   * session that drifts past its allowance costs money and, worse, tends to end
   * without the second number: the task half-done, nothing measured, no hours on
   * the progress page and no offer beside them. The whole value claim comes from
   * a subtraction that only exists if somebody asks for it before the end.
   *
   * Two contextual updates, which are silent and do not consume a spoken turn.
   * The first lands with enough time to close a task, the second with enough to
   * ask the second number and nothing else. How much time that is comes from
   * `wrapUpAt`, because a fixed five minutes was most of a ten minute class.
   */
  useEffect(() => {
    if (status !== 'connected') return;
    /*
     * Against the end of the call, not the end of the balance.
     *
     * These were scheduled off `minutesLeft` alone, so on the free tier they
     * fired at 15 and 19 minutes and on a paid tier at 295 and 299 — and the
     * platform hangs up at CLASS_CAP_MINUTES. Neither ever ran for anybody, so
     * no class was ever told to close, ask the second number, or take a
     * commitment. See `wrapUpAt`.
     */
    const when = wrapUpAt(minutesLeftRef.current);
    if (!when) return;

    const at = (minutes: number, message: string) =>
      window.setTimeout(() => sendContextualUpdate(message), minutes * 60_000);

    const timers = [
      at(
        when.close,
        `Quedan unos ${when.closeRemaining} minutos de esta clase. Cierra la tarea con lo que ya ` +
          'tienen y pregúntale cuánto tardó, para poder decirle la resta antes de terminar. ' +
          'El mapa y el plan pueden esperar.',
      ),
      at(
        when.last,
        'Queda 1 minuto. Si todavía no tienes los dos números, pídele el de ahora y dile la resta ' +
          'en una frase. Después cierra con un compromiso corto y dile que lo que sigue está en su página de progreso.',
      ),
    ];

    return () => timers.forEach((t) => window.clearTimeout(t));
  }, [status, sendContextualUpdate]);

  // `starting` covers the gap between the click and the SDK taking over;
  // any settled status — open, failed, or closed — means that gap is over.
  useEffect(() => {
    if (status !== 'connecting') setStarting(false);
  }, [status]);

  /**
   * A connection that neither opens nor fails.
   *
   * `startSession` is fire-and-forget: success arrives as `connected`, failure
   * through `onError`, and `starting` is cleared by whichever comes. Neither has
   * to come. A socket can sit in `connecting` indefinitely on a captive portal,
   * a blocking proxy or a network that accepts the handshake and then goes
   * quiet, and no event is emitted for that.
   *
   * What the learner gets is the worst version of a dead end: the button reads
   * "Conectando…", stays disabled, and never says anything. They cannot retry,
   * because retrying is the button. They pressed the one thing the whole page
   * asks them to press, and it stopped.
   *
   * Twenty seconds is long enough that a slow network still connects — a healthy
   * one takes about two — and short enough that nobody is left watching a word.
   */
  useEffect(() => {
    if (!starting && status !== 'connecting') return;

    const timer = window.setTimeout(() => {
      setStarting(false);
      setError(
        'No pudimos conectar con el profesor. Puede ser tu red o un firewall del trabajo. ' +
          'Aprieta el botón otra vez, y si sigue igual prueba con otra conexión.',
      );
    }, 20_000);

    return () => window.clearTimeout(timer);
  }, [starting, status]);

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
        /** Minutes of allowance left at connect, or null when unmetered. */
        minutesLeft?: number | null;
        error?: string;
      };
      if (!res.ok || !data.signedUrl) {
        throw new Error(data.error ?? 'No se pudo conectar con el profesor.');
      }

      setTurns([]);
      lastTypedRef.current = null;
      minutesLeftRef.current = typeof data.minutesLeft === 'number' ? data.minutesLeft : null;
      setBenchSession(data.sessionId ?? null);
      // A new class starts with the panel closed, whatever the last one left open.
      setBench(null);
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
      setError(micMessage(err) ?? (err instanceof Error ? err.message : 'No se pudo iniciar la sesión.'));
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

  /*
   * The bench, into the teacher's ear.
   *
   * A contextual update rather than a typed turn, and the distinction is the
   * whole point: a typed turn is the learner speaking, and would make the
   * teacher answer the prompt they wrote instead of looking at what came back.
   * This is the teacher noticing something on the learner's screen. It spends
   * no spoken turn, which is what makes it affordable to send after every
   * exchange in a ten-minute class.
   *
   * This is also the fix for the interrogation the bench was built to end. The
   * teacher used to have exactly one way to find out what an assistant had
   * answered — ask, one question per turn — and burned whole classes
   * reconstructing a spreadsheet the learner had open in front of them.
   */
  const onBenchExchange = useCallback(
    (exchange: {
      modelId: PracticeModelId;
      prompt: string;
      attachments: readonly string[];
      answer: string;
    }) => {
      const model = practiceModel(exchange.modelId);
      if (!model) return;
      sendContextualUpdate(
        benchUpdate({
          model,
          prompt: exchange.prompt,
          attachments: exchange.attachments,
          answer: exchange.answer,
        }),
      );
    },
    [sendContextualUpdate],
  );

  /*
   * A failure is worth telling the teacher too. Without this the learner goes
   * quiet fighting an error box while the teacher waits on a step it thinks is
   * being done, and `skip_turn` means it may wait a long time.
   */
  const onBenchFailure = useCallback(
    (reason: string) => sendContextualUpdate(benchFailureUpdate(reason)),
    [sendContextualUpdate],
  );

  return (
    /*
      One column, now that there is only one thing to put in it.

      This was two columns before a class: the explorer on the left, a sidebar
      on the right. Both rendered the same 15 questions out of `TOPICS`, so the
      screen where somebody decides what to ask first offered 30 tappable
      items, half of them repeats, with nothing to say why the same question
      appeared twice or which copy to trust.

      The sidebar lost. The explorer says the same things and starts the class
      on whichever one is tapped, which is what this screen is for; the sidebar
      only filled the objective field, and that field is directly above it with
      a cursor already in it.
    */
    <div className="grid gap-6">
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
          {/*
            Gone once the class starts, rather than greyed out.
            
            It was `disabled={connected}`, which is correct behaviour and the
            wrong appearance: a dead input box sitting above a live conversation
            is a control that looks broken and can never be used again this
            session. Its job — seeding the first turn — is finished the moment
            the socket opens.
          */}
          {!connected && (
            <label className="block">
              {/*
                "Si quieres" rather than nothing.
              
                The field is optional and read as required, which is the wrong way
                round for the one screen whose whole job is to get a button
                pressed. A first-time learner does not know what to write here —
                the teacher asks the same question in its first minute, which is
                where they will answer it better — and an empty box above a button
                reads as a form to complete before the thing starts.
              
                Two words, and the button stops waiting on a decision nobody has
                to make. Somebody returning with a task in mind still types it and
                saves themselves a turn, which is who the field was for.
              */}
              <span className="mb-2 block text-xs font-semibold uppercase tracking-[0.08em] text-muted">
                Tu objetivo de hoy{' '}
                <span className="font-normal normal-case tracking-normal text-soft">
                  · si quieres
                </span>
              </span>
              <input
                value={objective}
                onChange={(e) => setObjective(e.target.value)}
                /*
                 * A placeholder is an example of what to type, so it has to be an
                 * example this product's learner would recognise. This said
                 * "revertir una versión que falló" — reverting a failed release,
                 * a developer's task, left over from a product this one is not.
                 *
                 * The people here are analysts, lawyers, operations, people out
                 * of work: the curriculum's own examples are supplier email and
                 * the weekly report. Somebody who reads a placeholder about
                 * releases concludes the teacher is for somebody else, in the one
                 * field they were about to type their own task into.
                 */
                placeholder="el informe semanal que me toma toda la mañana"
                disabled={connected}
                className="w-full max-w-xl rounded-md border border-field bg-surface px-3.5 py-2.5 text-[15px] text-ink transition-colors duration-150 ease-out placeholder:text-muted hover:border-line-strong focus:border-accent focus:outline-none focus:ring-4 focus:ring-accent-soft disabled:bg-surface-alt disabled:text-muted"
              />
            </label>
          )}

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

          {/*
            The privacy link belongs here rather than only in the footer.
            
            This is the sentence somebody reads with their finger over the
            button, and the question it raises — who hears this — is the one the
            page answers. A footer link is discoverable by whoever already
            decided to look; this is for the person deciding whether to open a
            client's document in front of a microphone, which is the decision
            actually being made at this moment.
            
            Six words and no panel, because a privacy notice that interrupts is
            a privacy notice people click past.
          */}
          {!connected && (
            <p className="mt-3 text-xs text-muted">
              Se pedirá permiso para usar el micrófono. Si prefieres escribir, puedes
              hacerlo una vez empezada la sesión.{' '}
              <a
                href="/privacidad"
                className="underline underline-offset-2 transition-colors duration-150 hover:text-accent"
              >
                Qué se guarda de la clase
              </a>
              .
            </p>
          )}
        </section>

        {/*
          Before the session only. Once the transcript is live this would
          compete with it for the same attention, and the sidebar covers the
          same ground for anyone who needs a prompt mid-conversation.
        */}
        {!connected && (
          <CoachExplorer
            onAsk={askAndStart}
            busy={starting || status === 'connecting'}
            canSearch={canSearch}
          />
        )}

        {error && (
          <p
            role="alert"
            className="flex flex-wrap items-start gap-2.5 rounded-md border border-danger/25 bg-danger-soft/60 px-4 py-3 text-sm text-danger"
          >
            <span aria-hidden className="mt-px font-semibold">
              !
            </span>
            <span className="text-ink/85">{withoutUpgradeMarker(error)}</span>
            {/*
              The plan gate is the one error with somewhere to go.
              
              The message comes from the server, which cannot render a link, so
              the marker it carries becomes one here. Only the marker is removed;
              the sentence keeps its own mention of the plans, and that is
              deliberate rather than an oversight — `gate.test.ts` requires every
              gate message to still read as a sentence with the link pulled out,
              because the same strings are logged, quoted in the doctor, and
              could be shown anywhere that cannot render an anchor.
              
              The cost is that a reader sees "mira los planes" and then a link
              saying much the same. That is the right side of the trade: a
              sentence that depends on a link is broken everywhere the link is
              absent, and this one is never absent by much.
            */}
            {offersUpgrade(error) && (
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

        {/*
          Two text boxes on one screen is the crowding people report as "too
          much information", and it is worse than clutter: one of them writes to
          the teacher and the other writes to the model, they look identical,
          and nothing on screen says which is which. Somebody types their prompt
          into the wrong one and the class goes sideways.

          So the typed channel to the teacher folds away while the bench is
          open. It is a fallback — the name says so, most people are talking —
          and one line of text costs far less attention than a second input.
        */}
        {connected && <TextFallback onSend={sendTyped} collapsed={Boolean(bench)} />}

        {/*
          During the class, and only once the teacher has opened it.

          The class part is not a limitation to work around later: the bench is
          worth having because the teacher is watching, and outside a call
          nobody is. It is also metered against the same allowance, and a free
          tier of twenty minutes that can be spent without ever opening a class
          buys the learner nothing and us nothing.

          The teacher part is the fix for a panel that used to appear for
          everybody — including the learner who had just said they were walking.
        */}
        {connected && bench && (
          <PracticeBench
            key={benchSession ?? 'bench'}
            sessionId={benchSession}
            initialModel={bench.model}
            task={bench.task}
            onExchange={onBenchExchange}
            onFailure={onBenchFailure}
          />
        )}

        {/*
          After the call, not during it. The plan and the evidence live on the
          progress page, and the moment somebody has just promised to do
          something is the moment to point at where it is written down. Shown
          only once there was a real conversation, so it never reads as an
          instruction to leave before starting.
        */}
        {!connected && turns.length > 0 && <AfterSession />}
      </div>

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
      ? 'El profesor está hablando'
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
        Tu plan, el paso en el que vas y lo que te comprometiste a hacer quedan en tu página de
        progreso, un minuto después de colgar. Ahí puedes marcar lo que cumpliste, describir qué
        construiste y anotar los minutos si no quedaron.
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
function TextFallback({
  onSend,
  collapsed = false,
}: {
  onSend: (text: string) => void;
  collapsed?: boolean;
}) {
  const [value, setValue] = useState('');
  const [open, setOpen] = useState(false);

  /*
   * Folded by default while the practice bench is on screen, so there is only
   * ever one visible place to type. Opening it is one click and the state is
   * local: closing the bench brings the input straight back, because `collapsed`
   * goes false and this branch stops running.
   */
  if (collapsed && !open) {
    return (
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="text-[13px] text-muted underline underline-offset-2 transition-colors duration-150 hover:text-accent"
      >
        Escribirle al profesor
      </button>
    );
  }

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
        placeholder="Escríbele al profesor…"
        className="flex-1 rounded-md border border-field bg-surface px-3.5 py-2.5 text-sm text-ink transition-colors duration-150 ease-out placeholder:text-muted hover:border-line-strong focus:border-accent focus:outline-none focus:ring-4 focus:ring-accent-soft"
      />
      <button className="rounded-md border border-line bg-surface px-5 py-2.5 text-sm font-semibold text-ink shadow-sm transition duration-150 ease-out hover:border-line-strong hover:shadow-md">
        Enviar
      </button>
    </form>
  );
}
