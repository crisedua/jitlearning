/**
 * Knowledge ingestion.
 *
 * Every source (file / url / text) funnels through `ingest()`, which creates
 * the document in ElevenLabs and starts RAG indexing. Indexing is asynchronous
 * on the ElevenLabs side, so `ingest()` returns as soon as the index job is
 * accepted — callers poll `indexStatus()` to learn when it becomes queryable.
 *
 * No local persistence: ElevenLabs holds the documents, and the agent config
 * holds each document's usage mode.
 */
import {
  computeRagIndex,
  createDocumentFromFile,
  createDocumentFromText,
  createDocumentFromUrl,
  deleteDocument,
  getRagIndexes,
} from './elevenlabs';
import { embeddingModel } from './config';
import { isIndexSettled } from './types';
import type { DocumentSourceType, RagIndexStatus, UsageMode } from './types';

/** Human-readable explanation for each way indexing can end badly. */
export const FAILURE_REASONS: Record<string, string> = {
  failed: 'Indexing failed on the ElevenLabs side. Try re-uploading the document.',
  rag_limit_exceeded:
    'Your workspace RAG storage limit is full. Delete unused documents or upgrade your plan.',
  document_too_small:
    'The document is too short to index. Very small sources work better in "always in context" mode.',
  cannot_index_folder: 'Folders cannot be indexed directly — index the documents inside.',
};

export type IngestSource =
  | { kind: 'file'; file: File }
  | { kind: 'url'; url: string; autoSync?: boolean }
  | { kind: 'text'; text: string };

export interface IngestResult {
  id: string;
  name: string;
  type: DocumentSourceType;
  usageMode: UsageMode;
  indexStatus?: RagIndexStatus;
  indexError?: string;
}

/**
 * Create a knowledge base document and start indexing it.
 *
 * Documents in `prompt` mode are pinned into the system prompt and never
 * retrieved, so indexing is skipped for them.
 */
export async function ingest(
  source: IngestSource,
  opts: { name?: string; usageMode?: UsageMode } = {},
): Promise<IngestResult> {
  const usageMode: UsageMode = opts.usageMode ?? 'auto';

  let created: { id: string; name?: string };
  switch (source.kind) {
    case 'file':
      created = await createDocumentFromFile(source.file, opts.name ?? source.file.name);
      break;
    case 'url':
      created = await createDocumentFromUrl(source.url, {
        name: opts.name,
        enableAutoSync: source.autoSync,
      });
      break;
    case 'text':
      created = await createDocumentFromText(
        source.text,
        opts.name ?? `note-${new Date().toISOString().slice(0, 10)}`,
      );
      break;
  }

  const base: IngestResult = {
    id: created.id,
    name: created.name ?? opts.name ?? 'Untitled',
    type: source.kind,
    usageMode,
  };

  if (usageMode === 'prompt') return base;

  // Don't lose the document we just created over an indexing hiccup — report
  // the failure and let the caller retry against the existing document id.
  try {
    const index = await computeRagIndex(created.id, embeddingModel());
    return { ...base, indexStatus: index.status };
  } catch (err) {
    return {
      ...base,
      indexStatus: 'failed',
      indexError: err instanceof Error ? err.message : String(err),
    };
  }
}

export interface IndexState {
  status: RagIndexStatus;
  progress: number;
  error?: string;
}

/**
 * Current index state for our configured embedding model.
 *
 * A document can hold indexes for several models; a document indexed only
 * under a *different* model is not retrievable by this agent, so it correctly
 * reads back as `new`.
 */
export async function indexStatus(documentId: string): Promise<IndexState> {
  const model = embeddingModel();
  const overview = await getRagIndexes(documentId);
  const index = overview.indexes?.find((i) => i.model === model);

  if (!index) return { status: 'new', progress: 0 };

  return {
    status: index.status,
    progress: index.progress_percentage ?? 0,
    error: FAILURE_REASONS[index.status],
  };
}

/** Start (or retry) indexing. Idempotent — safe to call on an indexed document. */
export async function reindex(documentId: string): Promise<RagIndexStatus> {
  const index = await computeRagIndex(documentId, embeddingModel());
  return index.status;
}

/** Delete from ElevenLabs, detaching it from any agent that references it. */
export async function purge(documentId: string): Promise<void> {
  await deleteDocument(documentId, true);
}

/**
 * Block until every index settles. Used by the CLI ingest script, where it is
 * useful to exit only once the corpus is genuinely queryable.
 */
export async function waitForIndexing(
  documentIds: readonly string[],
  { timeoutMs = 300_000, intervalMs = 3_000 } = {},
): Promise<Map<string, RagIndexStatus>> {
  const results = new Map<string, RagIndexStatus>();
  const deadline = Date.now() + timeoutMs;
  let pending = [...documentIds];

  while (pending.length > 0 && Date.now() < deadline) {
    const stillPending: string[] = [];
    for (const id of pending) {
      const { status } = await indexStatus(id);
      if (isIndexSettled(status)) results.set(id, status);
      else stillPending.push(id);
    }
    pending = stillPending;
    if (pending.length > 0) await new Promise((r) => setTimeout(r, intervalMs));
  }

  // Anything still moving when we ran out of time is reported as such rather
  // than silently omitted.
  for (const id of pending) results.set(id, 'processing');
  return results;
}
