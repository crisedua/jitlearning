'use client';

import { useCallback, useRef, useState } from 'react';
import { offersUpgrade, withoutUpgradeMarker } from '@/lib/gate';
import {
  ACCEPTED_EXTENSIONS,
  MAX_FILES,
  PRACTICE_MODELS,
  practiceModel,
  tooLarge,
  type PracticeModelId,
} from '@/lib/practica';

interface Exchange {
  role: 'user' | 'assistant';
  content: string;
  /** Filenames, on the turn they were attached to. */
  files?: readonly string[];
}

/**
 * The practice bench, beside the class.
 *
 * The learner writes to Gemini, Claude or ChatGPT here and the teacher — live,
 * in their ear — reacts to what came back. `onExchange` is that channel: the
 * parent turns it into a contextual update on the open call, which costs no
 * spoken turn. See `src/lib/practica.ts` for why this exists at all.
 *
 * ## It says what it is
 *
 * Two sentences of framing that look like they could be cut, and neither can.
 *
 * The first is that these are the models and not the products. Somebody who
 * practises here believing they have used Gemini, and then opens the real one
 * and finds a different screen with a Drive button and no history, has been
 * misled by us — on the one page where our whole pitch is that we teach the
 * thing honestly.
 *
 * The second is that this is a rehearsal. The weekly saving the product is sold
 * on has to keep working in their own account after they stop paying us, so the
 * bench cannot quietly become where the work lives.
 */
export function PracticeBench({
  sessionId,
  initialModel,
  task,
  onExchange,
  onFailure,
}: {
  sessionId: string | null;
  /** Which one the teacher opened it on. The learner can still switch. */
  initialModel: PracticeModelId;
  /** The exercise, in the learner's own words, shown above the box. */
  task: string | null;
  /** Fired with the prompt and the answer once an exchange completes. */
  onExchange: (exchange: {
    modelId: PracticeModelId;
    prompt: string;
    attachments: readonly string[];
    answer: string;
  }) => void;
  /** Fired when it did not complete, so the teacher is not left waiting. */
  onFailure: (reason: string) => void;
}) {
  /*
   * Seeded once, then owned by the learner.
   *
   * `initialModel` is what the teacher named when it opened the panel, and it
   * is deliberately not kept in sync afterwards: somebody who switches to
   * Claude mid-exercise has made a choice, and having the next tool call pull
   * them back would be the panel arguing with them.
   */
  const [modelId, setModelId] = useState<PracticeModelId>(initialModel);
  const [prompt, setPrompt] = useState('');
  const [files, setFiles] = useState<File[]>([]);
  const [turns, setTurns] = useState<Exchange[]>([]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  /** The cause, sent only to operators. See `detailFor` in /api/practica. */
  const [detail, setDetail] = useState<string | null>(null);
  const [warnings, setWarnings] = useState<readonly string[]>([]);
  /** Minutes of allowance left, as of the last exchange. Null = not metered. */
  const [left, setLeft] = useState<number | null>(null);
  const fileInput = useRef<HTMLInputElement>(null);
  const feed = useRef<HTMLDivElement>(null);

  const model = practiceModel(modelId)!;

  /*
   * The size check happens here, at selection, and not at send.
   *
   * Vercel rejects an oversized body before the route runs, so the server
   * cannot produce a message about it that names the files — by then they are
   * gone. Checking on selection means the learner is told while the picker is
   * still fresh in mind and can drop one, rather than losing a class turn to
   * "el banco no está disponible".
   */
  const addFiles = useCallback((incoming: FileList | null) => {
    if (!incoming) return;
    setFiles((current) => {
      const next = [...current, ...Array.from(incoming)].slice(0, MAX_FILES);
      const complaint = tooLarge(next.map((f) => f.size));
      setError(complaint);
      setDetail(null);
      return complaint ? current : next;
    });
  }, []);

  const send = useCallback(async () => {
    const text = prompt.trim();
    if ((!text && files.length === 0) || busy) return;

    const sent = files;
    const names = sent.map((f) => f.name);

    setBusy(true);
    setError(null);
    setDetail(null);
    setWarnings([]);
    setTurns((t) => [...t, { role: 'user', content: text, files: names }]);
    setPrompt('');
    setFiles([]);
    if (fileInput.current) fileInput.current.value = '';

    try {
      const body = new FormData();
      body.set('model', modelId);
      body.set('prompt', text);
      if (sessionId) body.set('sessionId', sessionId);
      /*
       * History without attachments, and computed from the state before this
       * turn was appended. Resending 120k characters of spreadsheet on every
       * follow-up is how a three-message exercise costs more than the class.
       */
      body.set(
        'history',
        JSON.stringify(turns.map((t) => ({ role: t.role, content: t.content }))),
      );
      for (const file of sent) body.append('file', file);

      const res = await fetch('/api/practica', { method: 'POST', body });

      /*
       * Two response shapes, told apart by content type.
       *
       * Anything that fails before the first token — not signed in, out of
       * allowance, no key — is a status code and a JSON body, because nothing
       * has been sent yet and a real status is what a log or a probe can see.
       * Once the answer starts arriving the status is already 200 and cannot be
       * taken back, so failures after that point travel inside the stream.
       */
      if (!res.headers.get('content-type')?.includes('ndjson')) {
        const data = (await res.json().catch(() => ({}))) as { error?: string; detail?: string };
        const reason = data.error ?? 'No se pudo enviar.';
        setError(reason);
        setDetail(data.detail ?? null);
        onFailure(reason);
        return;
      }

      /*
       * The assistant's turn is appended empty and filled in as text arrives,
       * so the learner watches it being written. Fifteen seconds of a
       * motionless panel inside a ten-minute class reads as broken, and
       * somebody who thinks it broke presses send again — which bills twice.
       */
      setTurns((t) => [...t, { role: 'assistant', content: '' }]);

      const reader = res.body!.getReader();
      const decoder = new TextDecoder();
      let buffer = '';
      let answer = '';
      let failed: string | null = null;

      const handle = (raw: string) => {
        if (!raw.trim()) return;
        let msg: {
          t: string;
          v?: string;
          warnings?: string[];
          error?: string;
          detail?: string;
          minutesLeft?: number | null;
        };
        try {
          msg = JSON.parse(raw);
        } catch {
          return;
        }

        if (msg.t === 'text' && msg.v) {
          answer += msg.v;
          setTurns((t) => {
            const next = [...t];
            next[next.length - 1] = { role: 'assistant', content: answer };
            return next;
          });
        } else if (msg.t === 'warn') {
          setWarnings(msg.warnings ?? []);
        } else if (msg.t === 'error') {
          failed = msg.error ?? 'No se pudo enviar.';
          setError(failed);
          setDetail(msg.detail ?? null);
        } else if (msg.t === 'done') {
          setLeft(typeof msg.minutesLeft === 'number' ? msg.minutesLeft : null);
        }
      };

      for (;;) {
        const { done, value } = await reader.read();
        if (done) break;
        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split('\n');
        // The tail may be half a line; it waits for the next chunk.
        buffer = lines.pop() ?? '';
        for (const l of lines) handle(l);
      }
      handle(buffer);

      /*
       * The teacher hears about it either way, and after the stream rather than
       * during: a contextual update per token would be absurd, and what it has
       * to coach on is the finished answer.
       */
      if (failed) onFailure(failed);
      else if (answer) onExchange({ modelId, prompt: text, attachments: names, answer });
    } catch {
      /*
       * A dropped connection, said plainly. The learner is mid-class with a
       * teacher talking to them, so this needs to be a sentence they can act on
       * in one second, not an error to read.
       */
      const reason = 'Se cortó la conexión con el banco. Vuelve a mandarlo.';
      setError(reason);
      onFailure(reason);
    } finally {
      setBusy(false);
      requestAnimationFrame(() =>
        feed.current?.scrollTo({ top: feed.current.scrollHeight, behavior: 'smooth' }),
      );
    }
  }, [prompt, files, busy, modelId, sessionId, turns, onExchange, onFailure]);

  return (
    <section className="rounded-lg border border-line bg-surface p-5 shadow-sm sm:p-6">
      <header className="mb-4">
        <div className="flex flex-wrap items-baseline justify-between gap-2">
          <h2 className="text-sm font-semibold uppercase tracking-[0.08em] text-muted">
            Banco de práctica
          </h2>
          {/*
            The meter, and only when there is something to meter.
            
            Null means this plan does not count minutes, and a countdown shown
            to somebody who is not being counted is a lie they would believe.
            It appears after the first exchange rather than on open, because
            before then the number would be the class's balance and this is the
            panel's own cost — showing it early invites the reading that the
            bench spent it.
          */}
          {left !== null && (
            <p className={left <= 2 ? 'text-xs font-medium text-danger' : 'text-xs text-muted'}>
              {left === 0
                ? 'Sin minutos'
                : `Te quedan ${left} ${left === 1 ? 'minuto' : 'minutos'}`}
            </p>
          )}
        </div>
        <p className="mt-2 text-sm text-ink/85">
          Escríbele acá y el profesor ve lo que te responde. Es un ensayo: la tarea de verdad
          la haces después en tu propia cuenta, para que te siga sirviendo cada semana.
        </p>
      </header>

      {/* The picker. Three buttons rather than a select: it is a choice worth
          seeing all of, and the note under it changes with the pick. */}
      <div className="flex flex-wrap gap-2" role="group" aria-label="Con cuál practicar">
        {PRACTICE_MODELS.map((m) => (
          <button
            key={m.id}
            type="button"
            onClick={() => setModelId(m.id)}
            aria-pressed={modelId === m.id}
            className={
              modelId === m.id
                ? 'rounded-full bg-accent px-4 py-1.5 text-sm font-medium text-white shadow-sm'
                : 'rounded-full border border-line px-4 py-1.5 text-sm text-ink/80 transition-colors duration-150 hover:border-line-strong hover:text-ink'
            }
          >
            {m.label}
          </button>
        ))}
      </div>

      <p className="mt-2.5 text-xs text-muted">
        {model.note}{' '}
        <span className="text-soft">
          Acá corre {model.detail} por API: el mismo modelo, sin lo que el producto le agrega
          encima (memoria entre chats, tu Drive, sus botones).
        </span>
      </p>

      {/*
        What they are here to do, kept in front of them.
        
        The teacher says the exercise out loud once and then the learner spends
        two minutes typing; by the end of a long prompt the original task is
        three turns of audio ago and gone. Voice does not persist, which is the
        same reason the notebook exists.
      */}
      {task && (
        <p className="mt-4 rounded-md border border-line bg-surface-alt/60 px-3.5 py-2.5 text-sm text-ink/85">
          <span className="font-medium">Ejercicio:</span> {task}
        </p>
      )}

      {turns.length > 0 && (
        <div
          ref={feed}
          className="mt-4 max-h-96 space-y-3 overflow-y-auto rounded-md border border-line bg-surface-alt/50 p-3"
        >
          {turns.map((turn, i) => (
            <div
              key={i}
              className={
                turn.role === 'user'
                  ? 'ml-auto max-w-[85%] rounded-lg bg-accent px-3.5 py-2.5 text-sm text-white'
                  : 'mr-auto max-w-[92%] rounded-lg border border-line bg-surface px-3.5 py-2.5 text-sm text-ink'
              }
            >
              {turn.files && turn.files.length > 0 && (
                <p className="mb-1.5 text-xs opacity-80">📎 {turn.files.join(', ')}</p>
              )}
              {/* Whitespace preserved: models answer in lists and tables, and
                  collapsing them turns a consolidated table into one long line
                  — which is the output the learner is here to inspect. */}
              <p className="whitespace-pre-wrap break-words">{turn.content}</p>
            </div>
          ))}
          {busy && <p className="text-xs text-muted">{model.label} está respondiendo…</p>}
        </div>
      )}

      {files.length > 0 && (
        <ul className="mt-4 flex flex-wrap gap-2">
          {files.map((f, i) => (
            <li
              key={`${f.name}-${i}`}
              className="inline-flex items-center gap-2 rounded-full border border-line bg-surface-alt px-3 py-1 text-xs text-ink/80"
            >
              {f.name}
              <button
                type="button"
                onClick={() => setFiles((cur) => cur.filter((_, j) => j !== i))}
                aria-label={`Quitar ${f.name}`}
                className="text-muted transition-colors hover:text-danger"
              >
                ×
              </button>
            </li>
          ))}
        </ul>
      )}

      <div className="mt-4">
        <textarea
          value={prompt}
          onChange={(e) => setPrompt(e.target.value)}
          onKeyDown={(e) => {
            // Enter sends, shift+enter breaks the line. A prompt with context in
            // it is several lines long, which is the lesson, so the modifier has
            // to produce the newline rather than the send.
            if (e.key === 'Enter' && !e.shiftKey) {
              e.preventDefault();
              void send();
            }
          }}
          rows={3}
          placeholder="Pídele lo que el profesor te dictó. Adjunta el archivo en vez de describírselo."
          className="w-full resize-y rounded-md border border-field bg-surface px-3.5 py-2.5 text-[15px] text-ink transition-colors duration-150 ease-out placeholder:text-muted hover:border-line-strong focus:border-accent focus:outline-none focus:ring-4 focus:ring-accent-soft"
        />

        <div className="mt-3 flex flex-wrap items-center gap-3">
          <input
            ref={fileInput}
            type="file"
            multiple
            accept={ACCEPTED_EXTENSIONS.join(',')}
            onChange={(e) => addFiles(e.target.files)}
            className="hidden"
            id="practica-files"
          />
          <label
            htmlFor="practica-files"
            className="cursor-pointer rounded-full border border-line px-4 py-2 text-sm text-ink/80 transition-colors duration-150 hover:border-line-strong hover:text-ink"
          >
            Adjuntar archivo
          </label>

          <button
            type="button"
            onClick={() => void send()}
            disabled={busy || (!prompt.trim() && files.length === 0)}
            className="rounded-full bg-accent px-6 py-2 text-sm font-medium text-white shadow-sm transition duration-150 ease-out hover:bg-accent-hover disabled:opacity-55"
          >
            {busy ? 'Enviando…' : `Enviar a ${model.label}`}
          </button>
        </div>
      </div>

      {/*
        The privacy line, next to the button that uploads a work document rather
        than in the footer. The curriculum's first lesson is what never goes into
        a chat window, and this is the exact moment it applies — a learner about
        to attach a client list is deciding right here.
      */}
      <p className="mt-3 text-xs text-muted">
        Los archivos no se guardan, pero lo que escribas acá sí, para que el profesor pueda
        enseñarte sobre tus peticiones. Quita nombres, RUT y datos de clientes antes de subir
        algo del trabajo.{' '}
        <a
          href="/privacidad"
          className="underline underline-offset-2 transition-colors duration-150 hover:text-accent"
        >
          Qué se guarda
        </a>
        .
      </p>

      {warnings.length > 0 && (
        <ul className="mt-3 space-y-1.5">
          {warnings.map((w, i) => (
            <li key={i} className="text-xs text-ink/75">
              · {w}
            </li>
          ))}
        </ul>
      )}

      {error && (
        <div
          role="alert"
          className="mt-3 rounded-md border border-danger/25 bg-danger-soft/60 px-3.5 py-2.5 text-sm text-ink/85"
        >
          <p>
            {withoutUpgradeMarker(error)}{' '}
            {/*
              Running out of allowance is the one failure with somewhere to go.
              The message comes from the server, which cannot render a link, so
              the marker it carries becomes one here — the same contract
              `VoiceTutor` has with `gate.ts`.
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
          {/*
            Operators only, and the server decides who that is: `detail` is
            simply absent from the response for everybody else. It is English,
            it names our provider, and it is the difference between "the bench
            is broken" and "the OpenRouter account has no credit".
          */}
          {detail && (
            <p className="mt-2 break-words font-mono text-xs text-ink/60">{detail}</p>
          )}
        </div>
      )}
    </section>
  );
}
