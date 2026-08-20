'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
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
 * ## Interaction rather than instruction
 *
 * The panel got two rounds of trimming for being crowded, and the way to make
 * it easier to use after that is not to put the words back. It is to let people
 * do the obvious thing and have it work: drop a file anywhere on the panel,
 * paste a screenshot, watch the box grow as the prompt gets longer, copy the
 * answer with one click. Every affordance here replaces a sentence that would
 * otherwise have to explain it.
 *
 * ## Motion is feedback, not decoration
 *
 * Each animation answers a question the learner would otherwise have to guess
 * at: the panel rises when the teacher opens it (something appeared, and it was
 * meant to), turns pop in as they land, the dots say the model is working
 * rather than stuck, and the caret says text is still arriving. All of it runs
 * on the keyframes `globals.css` already defines, and that file disables every
 * animation under `prefers-reduced-motion` — so none of this is load-bearing
 * for somebody who has asked for stillness.
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
  /** A file is being dragged over the panel. */
  const [dragging, setDragging] = useState(false);
  /** The thread is scrolled away from the newest turn. */
  const [away, setAway] = useState(false);
  /** Index of the answer whose text was just copied, for the confirmation. */
  const [copied, setCopied] = useState<number | null>(null);

  const fileInput = useRef<HTMLInputElement>(null);
  const feed = useRef<HTMLDivElement>(null);
  const box = useRef<HTMLTextAreaElement>(null);
  /*
   * `dragenter`/`dragleave` fire for every child element the pointer crosses,
   * so a boolean set from `dragleave` flickers the whole time somebody is
   * moving a file across the panel. Counting entries and exits is the standard
   * fix and the only one that survives nested children.
   */
  const dragDepth = useRef(0);

  const modelId = initialModel;
  const model = practiceModel(modelId)!;

  const lastPrompt = [...turns].reverse().find((t) => t.role === 'user')?.content ?? '';

  /*
   * Focus without scrolling. The panel opens mid-class, often below the fold,
   * and the learner's next move is to type — but yanking the page down while
   * the teacher is mid-sentence is disorienting. `preventScroll` gives the
   * cursor without moving anything.
   */
  useEffect(() => {
    box.current?.focus({ preventScroll: true });
  }, []);

  const scroll = useCallback((behavior: ScrollBehavior = 'smooth') => {
    requestAnimationFrame(() =>
      feed.current?.scrollTo({ top: feed.current.scrollHeight, behavior }),
    );
  }, []);

  /*
   * The size check happens at selection, not at send. Vercel rejects an
   * oversized body before the route runs, so the server cannot produce a
   * message that names the files — by then they are gone.
   */
  const addFiles = useCallback((incoming: FileList | File[] | null) => {
    if (!incoming) return;
    const list = Array.from(incoming);
    if (list.length === 0) return;
    setFiles((current) => {
      const next = [...current, ...list].slice(0, MAX_FILES);
      const complaint = tooLarge(next.map((f) => f.size));
      setError(complaint);
      setDetail(null);
      return complaint ? current : next;
    });
  }, []);

  /** Grows with the prompt, up to the cap the class can absorb. */
  const grow = useCallback(() => {
    const el = box.current;
    if (!el) return;
    el.style.height = 'auto';
    el.style.height = `${Math.min(el.scrollHeight, 160)}px`;
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
    requestAnimationFrame(grow);
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
          scroll('auto');
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
  }, [prompt, files, busy, modelId, sessionId, turns, onExchange, onFailure, grow, scroll]);

  /** Take the answer out of here, which is the point of producing it. */
  const copy = useCallback(async (text: string, index: number) => {
    try {
      await navigator.clipboard.writeText(text);
      setCopied(index);
      window.setTimeout(() => setCopied((c) => (c === index ? null : c)), 1600);
    } catch {
      /* Selecting it by hand still works; nothing here is worth an alert. */
    }
  }, []);

  const empty = turns.length === 0;

  return (
    <section
      /*
       * Drop anywhere on the panel, not only on the ＋. Dragging a spreadsheet
       * onto a chat is what people try first, and making it work removes the
       * sentence that would otherwise have to explain where the button is.
       */
      onDragEnter={(e) => {
        if (!e.dataTransfer.types.includes('Files')) return;
        dragDepth.current += 1;
        setDragging(true);
      }}
      onDragOver={(e) => {
        if (e.dataTransfer.types.includes('Files')) e.preventDefault();
      }}
      onDragLeave={() => {
        dragDepth.current = Math.max(0, dragDepth.current - 1);
        if (dragDepth.current === 0) setDragging(false);
      }}
      onDrop={(e) => {
        if (!e.dataTransfer.types.includes('Files')) return;
        e.preventDefault();
        dragDepth.current = 0;
        setDragging(false);
        addFiles(e.dataTransfer.files);
      }}
      className={`animate-rise relative overflow-hidden rounded-xl border bg-surface shadow-sm transition-colors duration-200 ${
        dragging ? 'border-accent ring-4 ring-accent-soft' : 'border-line'
      }`}
    >
      {/* The drop target, shown only while something is over the panel. */}
      {dragging && (
        <div className="animate-fade pointer-events-none absolute inset-0 z-10 grid place-items-center bg-surface/90 backdrop-blur-[1px]">
          <p className="text-sm font-medium text-accent">Suelta el archivo acá</p>
        </div>
      )}

      <header className="flex flex-wrap items-baseline justify-between gap-2 border-b border-line px-5 py-3.5">
        <h2 className="text-sm font-semibold text-ink">Banco de práctica</h2>
        {/*
          The meter, and only when there is something to meter. Null means this
          plan does not count minutes, and a countdown shown to somebody who is
          not being counted is a lie they would believe.
        */}
        {left !== null && (
          <p
            className={`animate-fade text-xs ${
              left <= 2 ? 'font-medium text-danger' : 'text-muted'
            }`}
          >
            {left === 0 ? 'Sin minutos' : `Te quedan ${left} ${left === 1 ? 'minuto' : 'minutos'}`}
          </p>
        )}
      </header>

      {task && (
        <p className="border-b border-line bg-surface-alt/50 px-5 py-3 text-sm text-ink/85">
          <span className="font-medium">Ejercicio:</span> {task}
        </p>
      )}

      <div className="relative">
        <div
          ref={feed}
          onScroll={(e) => {
            const el = e.currentTarget;
            setAway(el.scrollHeight - el.scrollTop - el.clientHeight > 80);
          }}
          className="max-h-[28rem] min-h-[13rem] space-y-5 overflow-y-auto px-5 py-5"
          aria-live="polite"
        >
          {empty ? (
            /*
             * Everything the learner has to be told sits here, in the one
             * moment they have nothing else to read. Once the thread starts it
             * disappears: a disclosure repeated under every message box stops
             * being read and becomes furniture.
             */
            <div className="animate-fade py-8 text-center">
              <p className="text-sm text-ink/85">Escríbele lo que el profesor te dictó.</p>
              <p className="mx-auto mt-1.5 max-w-xs text-xs leading-relaxed text-muted">
                Si la tarea vive en un archivo, arrástralo hasta acá.
              </p>
              <p className="mx-auto mt-4 max-w-xs text-[11px] leading-relaxed text-soft">
                Corre {model.detail} por API. Los archivos no se guardan; lo que escribas sí.{' '}
                <a
                  href="/privacidad"
                  className="underline underline-offset-2 transition-colors duration-150 hover:text-accent"
                >
                  Qué se guarda
                </a>
                .
              </p>
            </div>
          ) : (
            turns.map((turn, i) =>
              turn.role === 'user' ? (
                <div key={i} className="animate-pop flex justify-end">
                  <div className="max-w-[85%] rounded-2xl rounded-br-md bg-accent px-4 py-2.5 text-[15px] leading-relaxed text-white">
                    {turn.files && turn.files.length > 0 && (
                      <p className="mb-1.5 text-xs opacity-80">📎 {turn.files.join(', ')}</p>
                    )}
                    <p className="whitespace-pre-wrap break-words">{turn.content}</p>
                  </div>
                </div>
              ) : (
                /*
                 * The answer runs full width with no bubble: it is the one thing
                 * on screen worth reading closely — a consolidated table, a
                 * total to check — and a narrow tinted box is the wrong
                 * container for that.
                 */
                <div key={i} className="animate-pop group text-[15px] leading-relaxed text-ink">
                  <div className="mb-1.5 flex items-center gap-2">
                    <p className="text-[11px] font-semibold uppercase tracking-[0.1em] text-soft">
                      Asistente
                    </p>
                    {/*
                      Copying the answer is the next thing they do with it —
                      into the report, the email, the sheet. Revealed on hover
                      and always reachable by keyboard, so it is there without
                      being one more thing on screen.
                    */}
                    {turn.content && !busy && (
                      <button
                        type="button"
                        onClick={() => void copy(turn.content, i)}
                        className="text-[11px] text-muted opacity-0 transition-opacity duration-150 hover:text-accent focus:opacity-100 group-hover:opacity-100"
                      >
                        {copied === i ? 'copiado' : 'copiar'}
                      </button>
                    )}
                  </div>
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

          {/* Working, not stuck. Three dots beat a word for the same reason a
              spinner does: it keeps moving while nothing else does. */}
          {busy && turns[turns.length - 1]?.role === 'user' && (
            <p className="flex items-center gap-1" aria-label="Pensando">
              {[0, 1, 2].map((d) => (
                <span
                  key={d}
                  aria-hidden
                  className="h-1.5 w-1.5 rounded-full bg-muted [animation:dot_1.4s_ease-in-out_infinite]"
                  style={{ animationDelay: `${d * 0.16}s` }}
                />
              ))}
            </p>
          )}
        </div>

        {/* Only when they have scrolled away from it, so it is an answer to a
            question they are actually asking. */}
        {away && (
          <button
            type="button"
            onClick={() => scroll()}
            className="animate-pop absolute bottom-3 left-1/2 -translate-x-1/2 rounded-full border border-line bg-surface px-3 py-1 text-xs text-muted shadow-sm transition-colors duration-150 hover:border-line-strong hover:text-accent"
          >
            Ir a lo último ↓
          </button>
        )}
      </div>

      <div className="border-t border-line px-5 py-4">
        {files.length > 0 && (
          <ul className="mb-2.5 flex flex-wrap gap-2">
            {files.map((f, i) => (
              <li
                key={`${f.name}-${i}`}
                className="animate-pop inline-flex items-center gap-2 rounded-full border border-line bg-surface-alt px-3 py-1 text-xs text-ink/80"
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
            className="mb-1 cursor-pointer rounded-full px-2 py-1 text-lg leading-none text-muted transition-all duration-150 hover:bg-surface-alt hover:text-accent active:scale-90"
          >
            <span aria-hidden>＋</span>
            <span className="sr-only">Adjuntar archivo</span>
          </label>

          <textarea
            ref={box}
            value={prompt}
            onChange={(e) => {
              setPrompt(e.target.value);
              grow();
            }}
            /*
             * Pasting a screenshot is how people move something from another
             * window into a chat. Without this it silently does nothing, which
             * reads as the panel being broken rather than as an unsupported
             * gesture.
             */
            onPaste={(e) => {
              const dropped = Array.from(e.clipboardData.files);
              if (dropped.length > 0) {
                e.preventDefault();
                addFiles(dropped);
              }
            }}
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
            className="max-h-40 min-h-[2.25rem] flex-1 resize-none overflow-y-auto border-0 bg-transparent py-1.5 text-[15px] leading-relaxed text-ink placeholder:text-muted focus:outline-none focus:ring-0"
          />

          <button
            type="button"
            onClick={() => void send()}
            disabled={busy || (!prompt.trim() && files.length === 0)}
            aria-label="Enviar"
            className="mb-0.5 grid h-9 w-9 shrink-0 place-items-center rounded-full bg-accent text-white transition-all duration-200 ease-out hover:bg-accent-hover active:scale-90 disabled:scale-100 disabled:opacity-40"
          >
            <span aria-hidden className="text-base leading-none">
              {busy ? (
                <span className="block h-3.5 w-3.5 animate-spin rounded-full border-2 border-white/40 border-t-white" />
              ) : (
                '↑'
              )}
            </span>
          </button>
        </div>

        {warnings.length > 0 && (
          <ul className="mt-2.5 space-y-1">
            {warnings.map((w, i) => (
              <li key={i} className="animate-fade text-xs text-ink/75">
                · {w}
              </li>
            ))}
          </ul>
        )}

        {error && (
          <div
            role="alert"
            className="animate-pop mt-2.5 rounded-md border border-danger/25 bg-danger-soft/60 px-3.5 py-2.5 text-sm text-ink/85"
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

        {lastPrompt && <OpenInProduct prompt={lastPrompt} label="Repítelo en tu cuenta" />}
      </div>
    </section>
  );
}
