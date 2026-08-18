'use client';

import { useCallback, useRef, useState } from 'react';
import { offersUpgrade, withoutUpgradeMarker } from '@/lib/gate';
import { OpenInProduct } from './OpenInProduct';
import {
  ACCEPTED_EXTENSIONS,
  MAX_FILES,
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
 * The practice bench: one chat, no chooser.
 *
 * The learner writes to an assistant here and the teacher — live, in their ear
 * — reacts to what came back. `onExchange` is that channel: the parent turns it
 * into a contextual update on the open call, which costs no spoken turn. See
 * `src/lib/practica.ts` for why this exists at all.
 *
 * ## The model picker is gone
 *
 * Three pill buttons sat at the top and made the first decision in the panel a
 * question the learner cannot answer: they are here precisely because they do
 * not yet know how Gemini differs from Claude. It also framed the panel as a
 * comparison tool, which it is not — the lesson is what to write and how to
 * check the answer, and that transfers across all three.
 *
 * Which model runs is still a real choice, made by the teacher: it arrives as
 * `initialModel` from `open_model_sandbox`, so a class about long documents can
 * open on the one that handles them best without the learner being asked. What
 * is running is stated under the composer rather than offered as a control.
 *
 * ## It looks like a chat, and deliberately like nobody's chat
 *
 * The conventions here — the learner's turn in a bubble, the answer as plain
 * full-width text, a rounded composer with the attach control inside it — are
 * the shared grammar of every assistant, and following them means nobody has to
 * be taught this screen before they can use it. The palette, type and spacing
 * are this product's own. Cloning Gemini's or ChatGPT's identity would be
 * trademark exposure with no upside, and worse teaching: a learner who believes
 * they used Gemini here is in for a surprise when they open the real one.
 */
export function PracticeBench({
  sessionId,
  initialModel,
  task,
  onExchange,
  onFailure,
}: {
  sessionId: string | null;
  /** Which model the teacher opened on. Not shown as a control. */
  initialModel: PracticeModelId;
  /** The exercise, in the learner's own words, shown above the thread. */
  task: string | null;
  onExchange: (exchange: {
    modelId: PracticeModelId;
    prompt: string;
    attachments: readonly string[];
    answer: string;
  }) => void;
  onFailure: (reason: string) => void;
}) {
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

  const modelId = initialModel;
  const model = practiceModel(modelId)!;

  /*
   * The last thing the learner actually sent, for the handoff buttons. Their
   * own words rather than the teacher's dictation: by the time an exchange has
   * worked, the prompt has usually been corrected once or twice, and the
   * corrected one is what they want in their own account.
   */
  const lastPrompt = [...turns].reverse().find((t) => t.role === 'user')?.content ?? '';

  /*
   * The size check happens at selection, not at send. Vercel rejects an
   * oversized body before the route runs, so the server cannot produce a
   * message that names the files — by then they are gone.
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

    const scroll = () =>
      requestAnimationFrame(() =>
        feed.current?.scrollTo({ top: feed.current.scrollHeight, behavior: 'smooth' }),
      );
    scroll();

    try {
      const body = new FormData();
      body.set('model', modelId);
      body.set('prompt', text);
      if (sessionId) body.set('sessionId', sessionId);
      body.set(
        'history',
        JSON.stringify(turns.map((t) => ({ role: t.role, content: t.content }))),
      );
      for (const file of sent) body.append('file', file);

      const res = await fetch('/api/practica', { method: 'POST', body });

      /*
       * Two response shapes, told apart by content type. Anything that fails
       * before the first token is a status code and a JSON body; once the
       * answer starts arriving the status is already 200 and failures travel
       * inside the stream.
       */
      if (!res.headers.get('content-type')?.includes('ndjson')) {
        const data = (await res.json().catch(() => ({}))) as { error?: string; detail?: string };
        const reason = data.error ?? 'No se pudo enviar.';
        setError(reason);
        setDetail(data.detail ?? null);
        onFailure(reason);
        return;
      }

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
          scroll();
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
        buffer = lines.pop() ?? '';
        for (const l of lines) handle(l);
      }
      handle(buffer);

      if (failed) onFailure(failed);
      else if (answer) onExchange({ modelId, prompt: text, attachments: names, answer });
    } catch {
      const reason = 'Se cortó la conexión con el banco. Vuelve a mandarlo.';
      setError(reason);
      onFailure(reason);
    } finally {
      setBusy(false);
      scroll();
    }
  }, [prompt, files, busy, modelId, sessionId, turns, onExchange, onFailure]);

  const empty = turns.length === 0;

  return (
    <section className="overflow-hidden rounded-xl border border-line bg-surface shadow-sm">
      <header className="flex flex-wrap items-baseline justify-between gap-2 border-b border-line px-5 py-3.5">
        <h2 className="text-sm font-semibold text-ink">Banco de práctica</h2>
        {/*
          The meter, and only when there is something to meter. Null means this
          plan does not count minutes, and a countdown shown to somebody who is
          not being counted is a lie they would believe.
        */}
        {left !== null && (
          <p className={left <= 2 ? 'text-xs font-medium text-danger' : 'text-xs text-muted'}>
            {left === 0 ? 'Sin minutos' : `Te quedan ${left} ${left === 1 ? 'minuto' : 'minutos'}`}
          </p>
        )}
      </header>

      {/*
        The exercise, kept in front of them. The teacher says it once and the
        learner then spends two minutes typing; by the end of a long prompt the
        original task is three turns of audio ago and gone.
      */}
      {task && (
        <p className="border-b border-line bg-surface-alt/50 px-5 py-3 text-sm text-ink/85">
          <span className="font-medium">Ejercicio:</span> {task}
        </p>
      )}

      <div
        ref={feed}
        className="max-h-[28rem] min-h-[13rem] space-y-5 overflow-y-auto px-5 py-5"
        aria-live="polite"
      >
        {empty ? (
          /*
           * The empty state carries the one instruction that changes behaviour,
           * and it is the instruction the whole bench exists to give: hand over
           * the file, do not describe it. A learner who types "tengo una
           * planilla con tres hojas" has already lost the exercise.
           */
          <div className="py-8 text-center">
            <p className="text-sm text-ink/85">Escríbele lo que el profesor te dictó.</p>
            <p className="mx-auto mt-1.5 max-w-sm text-xs leading-relaxed text-muted">
              Si la tarea vive en un archivo, adjúntalo en vez de describírselo. Para eso está.
            </p>
          </div>
        ) : (
          turns.map((turn, i) =>
            turn.role === 'user' ? (
              <div key={i} className="flex justify-end">
                <div className="max-w-[85%] rounded-2xl rounded-br-md bg-accent px-4 py-2.5 text-[15px] leading-relaxed text-white">
                  {turn.files && turn.files.length > 0 && (
                    <p className="mb-1.5 text-xs opacity-80">📎 {turn.files.join(', ')}</p>
                  )}
                  <p className="whitespace-pre-wrap break-words">{turn.content}</p>
                </div>
              </div>
            ) : (
              /*
               * The answer runs full width with no bubble, which is the modern
               * convention and not decoration: this is the text the learner has
               * to *inspect* — a consolidated table, a list, a number to check —
               * and a narrow tinted box is the wrong container for the only
               * thing on screen worth reading closely.
               */
              <div key={i} className="text-[15px] leading-relaxed text-ink">
                <p className="mb-1.5 text-[11px] font-semibold uppercase tracking-[0.1em] text-soft">
                  Asistente
                </p>
                <p className="whitespace-pre-wrap break-words">
                  {turn.content}
                  {busy && i === turns.length - 1 && (
                    <span
                      aria-hidden
                      className="ml-0.5 inline-block h-[1.05em] w-[2px] translate-y-[0.15em] bg-accent [animation:caret_1.1s_step-end_infinite]"
                    />
                  )}
                </p>
              </div>
            ),
          )
        )}

        {busy && turns[turns.length - 1]?.role === 'user' && (
          <p className="text-[13px] text-muted">Pensando…</p>
        )}
      </div>

      <div className="border-t border-line px-5 py-4">
        {files.length > 0 && (
          <ul className="mb-2.5 flex flex-wrap gap-2">
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

        {/* One rounded field holding the controls, so attaching reads as part
            of writing the message rather than as a separate step. */}
        <div className="flex items-end gap-2 rounded-2xl border border-field bg-surface px-3 py-2 transition-colors duration-150 focus-within:border-accent focus-within:ring-4 focus-within:ring-accent-soft hover:border-line-strong">
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
            title="Adjuntar archivo"
            className="mb-1 cursor-pointer rounded-full px-2 py-1 text-lg leading-none text-muted transition-colors duration-150 hover:bg-surface-alt hover:text-accent"
          >
            <span aria-hidden>＋</span>
            <span className="sr-only">Adjuntar archivo</span>
          </label>

          <textarea
            value={prompt}
            onChange={(e) => setPrompt(e.target.value)}
            onKeyDown={(e) => {
              /*
               * Enter sends, shift+enter breaks the line. A prompt with real
               * context in it is several lines long — which is the lesson — so
               * the modifier has to produce the newline, not the send.
               */
              if (e.key === 'Enter' && !e.shiftKey) {
                e.preventDefault();
                void send();
              }
            }}
            rows={1}
            placeholder="Escribe tu petición…"
            className="max-h-40 min-h-[2.25rem] flex-1 resize-none border-0 bg-transparent py-1.5 text-[15px] leading-relaxed text-ink placeholder:text-muted focus:outline-none focus:ring-0"
          />

          <button
            type="button"
            onClick={() => void send()}
            disabled={busy || (!prompt.trim() && files.length === 0)}
            aria-label="Enviar"
            className="mb-0.5 grid h-9 w-9 shrink-0 place-items-center rounded-full bg-accent text-white transition duration-150 ease-out hover:bg-accent-hover disabled:opacity-40"
          >
            <span aria-hidden className="text-base leading-none">
              {busy ? '…' : '↑'}
            </span>
          </button>
        </div>

        {/*
          What is actually running, stated and not offered.

          A learner who believes they have used Gemini and then opens the real
          one — different screen, a Drive button, no history — has been misled by
          us, on the product whose whole pitch is that it teaches this honestly.
          Small type because it is a disclosure, not a decision.
        */}
        <p className="mt-2.5 text-[11px] leading-relaxed text-muted">
          Corre {model.detail} por API: el mismo modelo que hay detrás del producto, sin lo que el
          producto le agrega encima. Los archivos no se guardan; lo que escribas sí, para que el
          profesor pueda enseñarte sobre tus peticiones.{' '}
          <a
            href="/privacidad"
            className="underline underline-offset-2 transition-colors duration-150 hover:text-accent"
          >
            Qué se guarda
          </a>
          .
        </p>

        {warnings.length > 0 && (
          <ul className="mt-2.5 space-y-1">
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
            className="mt-2.5 rounded-md border border-danger/25 bg-danger-soft/60 px-3.5 py-2.5 text-sm text-ink/85"
          >
            <p>
              {withoutUpgradeMarker(error)}{' '}
              {offersUpgrade(error) && (
                <a
                  href="/planes"
                  className="font-semibold text-accent underline underline-offset-2 hover:text-accent-hover"
                >
                  Ver los planes
                </a>
              )}
            </p>
            {/* Operators only; the server decides who that is. */}
            {detail && <p className="mt-2 break-words font-mono text-xs text-ink/60">{detail}</p>}
          </div>
        )}

        {/*
          The door out. The bench is a rehearsal — the products cannot be
          embedded — and the weekly saving has to keep working in the learner's
          own account after they stop paying us.
        */}
        {lastPrompt && <OpenInProduct prompt={lastPrompt} label="Repítelo en tu cuenta" />}
      </div>
    </section>
  );
}
