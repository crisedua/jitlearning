/** Shared domain types. ElevenLabs is the only persistent store. */

/** Embedding models ElevenLabs offers for RAG indexing. */
export type EmbeddingModel = 'e5_mistral_7b_instruct' | 'multilingual_e5_large_instruct';

/**
 * Lifecycle of a document's RAG index. Only `succeeded` means the document is
 * actually retrievable during a conversation — everything else is either
 * in-flight or terminal-failed.
 */
export type RagIndexStatus =
  | 'new'
  | 'created'
  | 'processing'
  | 'failed'
  | 'succeeded'
  | 'rag_limit_exceeded'
  | 'document_too_small'
  | 'cannot_index_folder';

export const IN_FLIGHT_STATUSES: readonly RagIndexStatus[] = [
  'new',
  'created',
  'processing',
];

export function isIndexSettled(status: RagIndexStatus): boolean {
  return !IN_FLIGHT_STATUSES.includes(status);
}

/** How a document is fed to the agent. */
export type UsageMode =
  /** Retrieved on demand via RAG when relevant to the learner's question. */
  | 'auto'
  /** Always pinned into the system prompt. Reserve for small, always-needed context. */
  | 'prompt';

export type DocumentSourceType = 'file' | 'url' | 'text' | 'folder';

/** A knowledge base document as ElevenLabs reports it. */
export interface KnowledgeDocument {
  id: string;
  name: string;
  type: DocumentSourceType;
}

export interface RagIndex {
  id: string;
  model: EmbeddingModel;
  status: RagIndexStatus;
  progress_percentage: number;
  document_model_index_usage?: { used_bytes: number };
}

/**
 * What the UI renders: the ElevenLabs document, plus derived state assembled
 * on each request rather than stored.
 */
export interface DocumentView extends KnowledgeDocument {
  /** Index state for our configured embedding model. */
  indexStatus: RagIndexStatus;
  indexProgress: number;
  /** Human-readable explanation when indexing failed terminally. */
  indexError?: string;
  /** Read back from the agent's config — absent means not attached yet. */
  usageMode?: UsageMode;
  attached: boolean;
  /** True when the agent can actually use this document right now. */
  ready: boolean;
}
