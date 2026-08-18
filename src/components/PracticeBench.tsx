'use client';

import { useCallback, useRef, useState } from 'react';
import {
  ACCEPTED_EXTENSIONS,
  MAX_FILES,
  PRACTICE_MODELS,
  practiceModel,
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
  onExchange,
  onFailure,
}: {
  sessionId: string | null;
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
  const [modelId, setModelId] = useState<PracticeModelId>('gemini');
  const [prompt, setPrompt] = useState('');
  const [files, setFiles] = useState<File[]>([]);
  const [turns, setTurns] = useState<Exchange[]>([]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [warnings, setWarnings] = useState<readonly string[]>([]);
  const fileInput = useRef<HTMLInputElement>(null);
  const feed = useRef<HTMLDivElement>(null);

  const model = practiceModel(modelId)!;

  const addFiles = useCallback((incoming: FileList | null) => {
    if (!incoming) return;
    setFiles((current) => [...current, ...Array.from(incoming)].slice(0, MAX_FILES));
  }, []);

  const send = useCallback(async () => {
    const text = prompt.trim();
    if ((!text && files.length === 0) || busy) return;

    const sent = files;
    const names = sent.map((f) => f.name);

    setBusy(true);
    setError(null);
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
      const data = (await res.json()) as {
        answer?: string;
        warnings?: string[];
        error?: string;
      };

      if (!res.ok || data.error) {
        const reason = data.error ?? 'No se pudo enviar.';
        setError(reason);
        onFailure(reason);
        return;
      }

      setWarnings(data.warnings ?? []);
      const answer = data.answer ?? '';
      setTurns((t) => [...t, { role: 'assistant', content: answer }]);
      onExchange({ modelId, prompt: text, attachments: names, answer });
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
        <h2 className="text-sm font-semibold uppercase tracking-[0.08em] text-muted">
          Banco de práctica
        </h2>
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
        Los archivos se leen para mandar el mensaje y no se guardan. Aun así, quita nombres,
        RUT y datos de clientes antes de subir algo del trabajo.{' '}
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
        <p
          role="alert"
          className="mt-3 rounded-md border border-danger/25 bg-danger-soft/60 px-3.5 py-2.5 text-sm text-ink/85"
        >
          {error}
        </p>
      )}
    </section>
  );
}
