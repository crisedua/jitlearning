'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { IN_FLIGHT_STATUSES } from '@/lib/types';
import type { DocumentView, RagIndexStatus } from '@/lib/types';

type Mode = 'file' | 'url' | 'text';

/** The union values are the wire format; these are what the tabs display. */
const MODE_LABEL: Record<Mode, string> = {
  file: 'Archivo',
  url: 'Enlace',
  text: 'Texto',
};

const SECRET_KEY = 'jit.ingestSecret';

const STATUS_LABEL: Record<RagIndexStatus, string> = {
  new: 'Sin indexar',
  created: 'En cola',
  processing: 'Indexando…',
  succeeded: 'Listo',
  failed: 'Falló',
  rag_limit_exceeded: 'Almacenamiento lleno',
  document_too_small: 'Demasiado corto para indexar',
  cannot_index_folder: 'Las carpetas no se indexan',
};

export function KnowledgeManager() {
  const [secret, setSecret] = useState('');
  const [docs, setDocs] = useState<DocumentView[]>([]);
  const [mode, setMode] = useState<Mode>('file');
  const [url, setUrl] = useState('');
  const [text, setText] = useState('');
  const [name, setName] = useState('');
  const [pinned, setPinned] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  // Kept in sessionStorage, not localStorage: the secret dies with the tab.
  useEffect(() => {
    setSecret(sessionStorage.getItem(SECRET_KEY) ?? '');
  }, []);

  const authHeaders = useCallback(
    (extra: Record<string, string> = {}) => ({ 'x-ingest-secret': secret, ...extra }),
    [secret],
  );

  const load = useCallback(async (): Promise<DocumentView[] | undefined> => {
    if (!secret) return;
    const res = await fetch('/api/knowledge', { headers: { 'x-ingest-secret': secret } });
    if (!res.ok) {
      const data = (await res.json().catch(() => ({}))) as { error?: string };
      setError(data.error ?? 'No se pudieron cargar los documentos.');
      return;
    }
    const data = (await res.json()) as { documents: DocumentView[] };
    setDocs(data.documents);
    setError(null);
    return data.documents;
  }, [secret]);

  useEffect(() => {
    void load();
  }, [load]);

  /**
   * While anything is indexing, poll. When the last one settles, re-sync the
   * agent — a document is only attachable once its index succeeds, so this is
   * what actually makes new uploads usable.
   */
  useEffect(() => {
    const pending = docs.filter((d) => IN_FLIGHT_STATUSES.includes(d.indexStatus));
    if (pending.length === 0 || !secret) return;

    const timer = setInterval(async () => {
      const next = await load();
      if (!next) return;
      const stillPending = next.filter((d) => IN_FLIGHT_STATUSES.includes(d.indexStatus));
      const newlyReady = next.some((d) => d.ready && !d.attached);
      if (stillPending.length === 0 && newlyReady) {
        await fetch('/api/agent', { method: 'POST', headers: authHeaders() });
        await load();
        setNotice('Indexación terminada: el profesor ya lo tiene.');
      }
    }, 3000);
    return () => clearInterval(timer);
  }, [docs, load, secret, authHeaders]);

  function saveSecret(value: string) {
    setSecret(value);
    sessionStorage.setItem(SECRET_KEY, value);
  }

  async function upload(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    setNotice(null);
    try {
      const usageMode = pinned ? 'prompt' : 'auto';
      let res: Response;

      if (mode === 'file') {
        const file = fileRef.current?.files?.[0];
        if (!file) throw new Error('Elige un archivo primero.');
        const form = new FormData();
        form.append('file', file);
        form.append('usageMode', usageMode);
        if (name) form.append('name', name);
        res = await fetch('/api/knowledge', {
          method: 'POST',
          headers: authHeaders(),
          body: form,
        });
      } else {
        res = await fetch('/api/knowledge', {
          method: 'POST',
          headers: authHeaders({ 'Content-Type': 'application/json' }),
          body: JSON.stringify({
            usageMode,
            name: name || undefined,
            ...(mode === 'url' ? { url } : { text }),
          }),
        });
      }

      const data = (await res.json()) as { error?: string; syncError?: string };
      if (!res.ok) throw new Error(data.error ?? 'Falló la subida.');

      setNotice(
        pinned
          ? 'Subido y adjuntado al profesor.'
          : 'Subido. Indexando: el profesor lo tomará automáticamente al terminar.',
      );
      if (data.syncError) setError(`Adjuntado con una advertencia: ${data.syncError}`);

      setUrl('');
      setText('');
      setName('');
      if (fileRef.current) fileRef.current.value = '';
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Falló la subida.');
    } finally {
      setBusy(false);
    }
  }

  async function remove(id: string) {
    await fetch(`/api/knowledge/${id}`, { method: 'DELETE', headers: authHeaders() });
    await load();
  }

  async function retry(id: string) {
    await fetch(`/api/knowledge/${id}`, { method: 'POST', headers: authHeaders() });
    await load();
  }

  async function sync() {
    setBusy(true);
    setError(null);
    try {
      const res = await fetch('/api/agent', { method: 'POST', headers: authHeaders() });
      const data = (await res.json()) as { attached?: number; error?: string };
      if (!res.ok) throw new Error(data.error ?? 'Falló la sincronización.');
      setNotice(`El profesor tiene ahora ${data.attached} documento(s) adjunto(s).`);
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Falló la sincronización.');
    } finally {
      setBusy(false);
    }
  }

  if (!secret) {
    return (
      <div className="max-w-md space-y-3 rounded-lg border border-line bg-surface p-5 shadow-sm">
        <p className="text-sm text-ink">
          Introduce el secreto de ingesta para gestionar la base de conocimiento.
        </p>
        <input
          type="password"
          onChange={(e) => saveSecret(e.target.value.trim())}
          aria-label="Secreto de ingesta"
          placeholder="INGEST_SECRET"
          className="w-full rounded-md border border-field bg-surface px-3.5 py-2.5 font-mono text-sm text-ink transition-colors duration-150 ease-out placeholder:text-muted hover:border-line-strong focus:border-accent focus:outline-none focus:ring-4 focus:ring-accent-soft"
        />
        <p className="text-xs leading-relaxed text-muted">
          Se guarda solo en esta pestaña. Es el mismo valor que la variable de entorno{' '}
          <code className="font-mono">INGEST_SECRET</code>.
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-8">
      <form
        onSubmit={upload}
        className="space-y-4 rounded-lg border border-line bg-surface p-5 shadow-sm sm:p-6"
      >
        <div className="flex gap-2">
          {(['file', 'url', 'text'] as Mode[]).map((m) => (
            <button
              key={m}
              type="button"
              onClick={() => setMode(m)}
              aria-pressed={mode === m}
              className={`rounded-md px-3.5 py-1.5 text-sm font-medium transition duration-150 ease-out ${
                mode === m
                  ? 'bg-accent text-white shadow-sm'
                  : 'border border-line text-muted hover:border-line-strong hover:text-ink'
              }`}
            >
              {MODE_LABEL[m]}
            </button>
          ))}
        </div>

        {mode === 'file' && (
          <input
            ref={fileRef}
            type="file"
            aria-label="Archivo a subir"
            accept=".pdf,.txt,.md,.docx,.html,.epub"
            className="w-full text-sm text-muted file:mr-3 file:rounded-md file:border-0 file:bg-surface-alt file:px-3.5 file:py-2 file:text-sm file:font-medium file:text-ink hover:file:bg-accent-soft"
          />
        )}
        {mode === 'url' && (
          <input
            value={url}
            onChange={(e) => setUrl(e.target.value)}
            aria-label="Enlace del que extraer el contenido"
            placeholder="https://docs.internal/runbook"
            className="w-full rounded-md border border-field bg-surface px-3.5 py-2.5 text-sm text-ink transition-colors duration-150 ease-out placeholder:text-muted hover:border-line-strong focus:border-accent focus:outline-none focus:ring-4 focus:ring-accent-soft"
          />
        )}
        {mode === 'text' && (
          <textarea
            value={text}
            onChange={(e) => setText(e.target.value)}
            rows={6}
            aria-label="Texto a indexar"
            placeholder="Pega notas, una transcripción, un manual…"
            className="w-full rounded-md border border-field bg-surface px-3.5 py-2.5 text-sm leading-relaxed text-ink transition-colors duration-150 ease-out placeholder:text-muted hover:border-line-strong focus:border-accent focus:outline-none focus:ring-4 focus:ring-accent-soft"
          />
        )}

        <input
          value={name}
          onChange={(e) => setName(e.target.value)}
          aria-label="Nombre visible del documento (opcional)"
          placeholder="Nombre visible (opcional)"
          className="w-full rounded-md border border-field bg-surface px-3.5 py-2.5 text-sm text-ink transition-colors duration-150 ease-out placeholder:text-muted hover:border-line-strong focus:border-accent focus:outline-none focus:ring-4 focus:ring-accent-soft"
        />

        <label className="flex items-start gap-2.5 text-sm text-ink">
          <input
            type="checkbox"
            checked={pinned}
            onChange={(e) => setPinned(e.target.checked)}
            className="mt-1 accent-[var(--color-accent)]"
          />
          <span>
            Siempre en contexto (omite RAG).
            <span className="mt-0.5 block text-xs leading-relaxed text-muted">
              Úsalo solo para material corto y siempre relevante: consume tokens en cada
              turno.
            </span>
          </span>
        </label>

        <div className="flex flex-wrap items-center gap-3">
          <button
            disabled={busy}
            className="rounded-md bg-accent px-5 py-2.5 text-sm font-semibold text-white shadow-sm transition duration-150 ease-out hover:-translate-y-px hover:bg-accent-hover hover:shadow-md disabled:translate-y-0 disabled:opacity-55 disabled:shadow-sm"
          >
            {busy ? 'Trabajando…' : 'Añadir a la base de conocimiento'}
          </button>
          <button
            type="button"
            onClick={() => void sync()}
            disabled={busy}
            className="rounded-md border border-line bg-surface px-5 py-2.5 text-sm font-semibold text-ink shadow-sm transition duration-150 ease-out hover:border-line-strong hover:shadow-md disabled:opacity-55"
          >
            Resincronizar profesor
          </button>
        </div>

        {error && (
          <p
            role="alert"
            className="rounded-md border border-danger/25 bg-danger-soft/60 px-3.5 py-2.5 text-sm text-danger"
          >
            {error}
          </p>
        )}
        {notice && (
          <p className="rounded-md border border-success/25 bg-success-soft/60 px-3.5 py-2.5 text-sm text-success">
            {notice}
          </p>
        )}
      </form>

      <section>
        <h2 className="mb-3 text-xs font-semibold uppercase tracking-[0.08em] text-muted">
          Documentos ({docs.length})
        </h2>
        {docs.length === 0 ? (
          <p className="rounded-lg border border-dashed border-line bg-surface px-4 py-6 text-center text-sm text-muted">
            Todavía no hay nada. El profesor responderá desde conocimiento general hasta que
            añadas material.
          </p>
        ) : (
          <ul className="divide-y divide-line overflow-hidden rounded-lg border border-line bg-surface shadow-sm">
            {docs.map((d) => {
              const inFlight = IN_FLIGHT_STATUSES.includes(d.indexStatus);
              const failed = !d.ready && !inFlight;
              return (
                <li
                  key={d.id}
                  className="flex items-center gap-4 px-4 py-3 transition-colors duration-150 ease-out hover:bg-surface-alt/50"
                >
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-medium text-ink">{d.name}</p>
                    <p className="text-xs text-muted">
                      {d.type}
                      {d.usageMode === 'prompt' && ' · fijado al prompt'}
                      {d.ready && !d.attached && ' · listo, sin adjuntar'}
                      {d.indexError && ` · ${d.indexError}`}
                    </p>
                  </div>
                  <span
                    className={`shrink-0 rounded-full px-2.5 py-1 text-xs font-medium ${
                      d.ready
                        ? 'bg-success-soft text-success'
                        : failed
                          ? 'bg-danger-soft text-danger'
                          : 'bg-warning-soft text-warning'
                    }`}
                  >
                    {d.usageMode === 'prompt' ? 'Fijado' : STATUS_LABEL[d.indexStatus]}
                  </span>
                  {failed && (
                    <button
                      onClick={() => void retry(d.id)}
                      className="shrink-0 rounded-sm text-xs font-medium text-accent hover:text-accent-hover"
                    >
                      Reintentar
                    </button>
                  )}
                  <button
                    onClick={() => void remove(d.id)}
                    className="shrink-0 rounded-sm text-xs font-medium text-muted hover:text-danger"
                  >
                    Eliminar
                  </button>
                </li>
              );
            })}
          </ul>
        )}
      </section>
    </div>
  );
}
