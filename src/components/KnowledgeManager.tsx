'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { IN_FLIGHT_STATUSES } from '@/lib/types';
import type { DocumentView, RagIndexStatus } from '@/lib/types';

type Mode = 'file' | 'url' | 'text';

const SECRET_KEY = 'jit.ingestSecret';

const STATUS_LABEL: Record<RagIndexStatus, string> = {
  new: 'Not indexed',
  created: 'Queued',
  processing: 'Indexing…',
  succeeded: 'Ready',
  failed: 'Failed',
  rag_limit_exceeded: 'Storage full',
  document_too_small: 'Too short to index',
  cannot_index_folder: 'Folders not indexable',
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
      setError(data.error ?? 'Could not load documents.');
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
        setNotice('Indexing finished — coach updated.');
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
        if (!file) throw new Error('Choose a file first.');
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
      if (!res.ok) throw new Error(data.error ?? 'Upload failed.');

      setNotice(
        pinned
          ? 'Uploaded and attached to the coach.'
          : 'Uploaded. Indexing now — the coach picks it up automatically when it finishes.',
      );
      if (data.syncError) setError(`Attached with a warning: ${data.syncError}`);

      setUrl('');
      setText('');
      setName('');
      if (fileRef.current) fileRef.current.value = '';
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Upload failed.');
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
      if (!res.ok) throw new Error(data.error ?? 'Sync failed.');
      setNotice(`Coach now has ${data.attached} document(s) attached.`);
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Sync failed.');
    } finally {
      setBusy(false);
    }
  }

  if (!secret) {
    return (
      <div className="max-w-md space-y-3 rounded-lg border border-[var(--color-line)] bg-[var(--color-surface)] p-5">
        <p className="text-sm text-gray-300">
          Enter the ingest secret to manage the knowledge base.
        </p>
        <input
          type="password"
          onChange={(e) => saveSecret(e.target.value.trim())}
          placeholder="INGEST_SECRET"
          className="w-full rounded-md border border-[var(--color-line)] bg-[var(--color-ink)] px-3 py-2 text-sm outline-none focus:border-[var(--color-accent)]"
        />
        <p className="text-xs text-gray-500">
          Stored for this browser tab only. It is the same value as the{' '}
          <code>INGEST_SECRET</code> environment variable.
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-8">
      <form
        onSubmit={upload}
        className="space-y-4 rounded-lg border border-[var(--color-line)] bg-[var(--color-surface)] p-5"
      >
        <div className="flex gap-2">
          {(['file', 'url', 'text'] as Mode[]).map((m) => (
            <button
              key={m}
              type="button"
              onClick={() => setMode(m)}
              className={`rounded-md px-3 py-1.5 text-sm capitalize ${
                mode === m
                  ? 'bg-[var(--color-accent)] text-white'
                  : 'border border-[var(--color-line)] text-gray-400 hover:text-white'
              }`}
            >
              {m}
            </button>
          ))}
        </div>

        {mode === 'file' && (
          <input
            ref={fileRef}
            type="file"
            accept=".pdf,.txt,.md,.docx,.html,.epub"
            className="w-full text-sm text-gray-300 file:mr-3 file:rounded-md file:border-0 file:bg-[var(--color-line)] file:px-3 file:py-2 file:text-sm file:text-white"
          />
        )}
        {mode === 'url' && (
          <input
            value={url}
            onChange={(e) => setUrl(e.target.value)}
            placeholder="https://docs.internal/runbook"
            className="w-full rounded-md border border-[var(--color-line)] bg-[var(--color-ink)] px-3 py-2 text-sm outline-none focus:border-[var(--color-accent)]"
          />
        )}
        {mode === 'text' && (
          <textarea
            value={text}
            onChange={(e) => setText(e.target.value)}
            rows={6}
            placeholder="Paste notes, a transcript, a runbook…"
            className="w-full rounded-md border border-[var(--color-line)] bg-[var(--color-ink)] px-3 py-2 text-sm outline-none focus:border-[var(--color-accent)]"
          />
        )}

        <input
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder="Display name (optional)"
          className="w-full rounded-md border border-[var(--color-line)] bg-[var(--color-ink)] px-3 py-2 text-sm outline-none focus:border-[var(--color-accent)]"
        />

        <label className="flex items-start gap-2 text-sm text-gray-400">
          <input
            type="checkbox"
            checked={pinned}
            onChange={(e) => setPinned(e.target.checked)}
            className="mt-1"
          />
          <span>
            Always in context (skips RAG).
            <span className="block text-xs text-gray-500">
              Use only for short, always-relevant material — it costs prompt tokens on
              every single turn.
            </span>
          </span>
        </label>

        <div className="flex items-center gap-3">
          <button
            disabled={busy}
            className="rounded-md bg-[var(--color-accent)] px-4 py-2 text-sm font-medium disabled:opacity-50 hover:brightness-110"
          >
            {busy ? 'Working…' : 'Add to knowledge base'}
          </button>
          <button
            type="button"
            onClick={() => void sync()}
            disabled={busy}
            className="rounded-md border border-[var(--color-line)] px-4 py-2 text-sm text-gray-300 disabled:opacity-50 hover:border-gray-500"
          >
            Re-sync coach
          </button>
        </div>

        {error && <p className="text-sm text-red-400">{error}</p>}
        {notice && <p className="text-sm text-emerald-400">{notice}</p>}
      </form>

      <section>
        <h2 className="mb-3 text-sm font-medium uppercase tracking-wide text-gray-500">
          Documents ({docs.length})
        </h2>
        {docs.length === 0 ? (
          <p className="text-sm text-gray-500">
            Nothing uploaded yet. The coach will answer from general knowledge until you
            add material.
          </p>
        ) : (
          <ul className="divide-y divide-[var(--color-line)] rounded-lg border border-[var(--color-line)]">
            {docs.map((d) => {
              const inFlight = IN_FLIGHT_STATUSES.includes(d.indexStatus);
              const failed = !d.ready && !inFlight;
              return (
                <li key={d.id} className="flex items-center gap-4 px-4 py-3">
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm text-gray-200">{d.name}</p>
                    <p className="text-xs text-gray-500">
                      {d.type}
                      {d.usageMode === 'prompt' && ' · pinned to prompt'}
                      {d.ready && !d.attached && ' · ready, not attached'}
                      {d.indexError && ` · ${d.indexError}`}
                    </p>
                  </div>
                  <span
                    className={`shrink-0 rounded-full px-2.5 py-1 text-xs ${
                      d.ready
                        ? 'bg-emerald-950 text-emerald-400'
                        : failed
                          ? 'bg-red-950 text-red-400'
                          : 'bg-amber-950 text-amber-400'
                    }`}
                  >
                    {d.usageMode === 'prompt' ? 'Pinned' : STATUS_LABEL[d.indexStatus]}
                  </span>
                  {failed && (
                    <button
                      onClick={() => void retry(d.id)}
                      className="shrink-0 text-xs text-gray-400 hover:text-white"
                    >
                      Retry
                    </button>
                  )}
                  <button
                    onClick={() => void remove(d.id)}
                    className="shrink-0 text-xs text-gray-500 hover:text-red-400"
                  >
                    Delete
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
