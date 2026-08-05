/**
 * Thin, typed wrapper over the ElevenLabs Agents Platform REST API.
 *
 * Only the surface this app needs is modelled. Everything goes through
 * `request()` so auth, error shape and JSON handling stay in one place.
 */
import type {
  DocumentSourceType,
  EmbeddingModel,
  KnowledgeDocument,
  RagIndex,
  UsageMode,
} from './types';

const BASE_URL = 'https://api.elevenlabs.io/v1';

export class ElevenLabsError extends Error {
  constructor(
    readonly status: number,
    readonly body: string,
    readonly endpoint: string,
  ) {
    super(`ElevenLabs ${status} on ${endpoint}: ${body}`);
    this.name = 'ElevenLabsError';
  }
}

function apiKey(): string {
  const key = process.env.ELEVENLABS_API_KEY;
  if (!key) {
    throw new Error(
      'ELEVENLABS_API_KEY is not set. Copy .env.example to .env.local and add your key.',
    );
  }
  return key;
}

async function request<T>(
  path: string,
  init: RequestInit & { query?: Record<string, string | number | boolean | undefined> } = {},
): Promise<T> {
  const { query, ...rest } = init;
  const url = new URL(BASE_URL + path);
  for (const [k, v] of Object.entries(query ?? {})) {
    if (v !== undefined) url.searchParams.set(k, String(v));
  }

  const headers = new Headers(rest.headers);
  headers.set('xi-api-key', apiKey());
  // Only set JSON content-type when we're not sending FormData — the browser/
  // undici must be free to set its own multipart boundary.
  if (rest.body !== undefined && !(rest.body instanceof FormData)) {
    headers.set('Content-Type', 'application/json');
  }

  const res = await fetch(url, { ...rest, headers });
  if (!res.ok) {
    throw new ElevenLabsError(res.status, await res.text(), path);
  }
  if (res.status === 204) return undefined as T;
  return (await res.json()) as T;
}

/* ---------------------------------------------------------------- knowledge */

export interface CreateDocumentResponse {
  id: string;
  name: string;
  folder_path?: Array<{ id: string }>;
}

/** Upload a file (pdf, docx, txt, html, epub…) as a knowledge base document. */
export async function createDocumentFromFile(
  file: File,
  name?: string,
): Promise<CreateDocumentResponse> {
  const form = new FormData();
  form.append('file', file);
  if (name) form.append('name', name);
  return request<CreateDocumentResponse>('/convai/knowledge-base/file', {
    method: 'POST',
    body: form,
  });
}

/** Scrape a URL into a knowledge base document. */
export async function createDocumentFromUrl(
  url: string,
  opts: { name?: string; enableAutoSync?: boolean } = {},
): Promise<CreateDocumentResponse> {
  return request<CreateDocumentResponse>('/convai/knowledge-base/url', {
    method: 'POST',
    body: JSON.stringify({
      url,
      name: opts.name,
      enable_auto_sync: opts.enableAutoSync ?? false,
    }),
  });
}

/** Store raw text (pasted notes, transcripts, runbooks) as a document. */
export async function createDocumentFromText(
  text: string,
  name?: string,
): Promise<CreateDocumentResponse> {
  return request<CreateDocumentResponse>('/convai/knowledge-base/text', {
    method: 'POST',
    body: JSON.stringify({ text, name }),
  });
}

export interface ListDocumentsResponse {
  documents: Array<KnowledgeDocument & { metadata?: Record<string, unknown> }>;
  has_more: boolean;
  next_cursor?: string;
}

export async function listDocuments(
  opts: { cursor?: string; pageSize?: number; search?: string } = {},
): Promise<ListDocumentsResponse> {
  return request<ListDocumentsResponse>('/convai/knowledge-base', {
    method: 'GET',
    query: { cursor: opts.cursor, page_size: opts.pageSize ?? 100, search: opts.search },
  });
}

export async function deleteDocument(documentId: string, force = true): Promise<void> {
  await request<void>(`/convai/knowledge-base/${documentId}`, {
    method: 'DELETE',
    // `force` detaches the document from any agent still referencing it.
    query: { force },
  });
}

/* --------------------------------------------------------------------- RAG */

/**
 * Kick off (or re-use) a RAG index for a document. This is idempotent —
 * calling it for an already-indexed document returns the existing index
 * rather than re-embedding, so it is safe to retry.
 */
export async function computeRagIndex(
  documentId: string,
  model: EmbeddingModel,
): Promise<RagIndex> {
  return request<RagIndex>(`/convai/knowledge-base/${documentId}/rag-index`, {
    method: 'POST',
    body: JSON.stringify({ model }),
  });
}

export interface RagIndexOverview {
  indexes: RagIndex[];
  total_used_bytes?: number;
  total_max_bytes?: number;
}

export async function getRagIndexes(documentId: string): Promise<RagIndexOverview> {
  return request<RagIndexOverview>(`/convai/knowledge-base/${documentId}/rag-index`, {
    method: 'GET',
  });
}

/* ------------------------------------------------------------------ agents */

export interface KnowledgeBaseEntry {
  type: DocumentSourceType;
  name: string;
  id: string;
  usage_mode: UsageMode;
}

export interface RagConfig {
  enabled: boolean;
  embedding_model: EmbeddingModel;
  /** Cosine-distance ceiling. Lower = stricter relevance. 0.6 is a good start. */
  max_vector_distance: number;
  /** Token ceiling for all retrieved chunks combined. */
  max_documents_length: number;
  max_retrieved_rag_chunks_count: number;
}

export interface AgentPromptConfig {
  prompt: string;
  llm?: string;
  knowledge_base: KnowledgeBaseEntry[];
  rag: RagConfig;
  /**
   * Tools live as workspace-level objects and are referenced by id. The older
   * inline `tools` array still exists on the agent but is the deprecated path;
   * only `tool_ids` is written here.
   */
  tool_ids?: string[];
}

/**
 * Fields ElevenLabs extracts from the transcript once a call is analysed.
 *
 * Keyed by field name; the description is a prompt, so it is written as an
 * instruction to an extractor rather than as documentation.
 */
export type DataCollectionConfig = Record<
  string,
  { type: 'string' | 'number' | 'boolean' | 'integer'; description: string }
>;

export interface AgentConfig {
  name?: string;
  conversation_config: {
    agent: {
      first_message?: string;
      language?: string;
      prompt: AgentPromptConfig;
    };
    tts?: {
      voice_id?: string;
      model_id?: string;
      /** 0–1. Lower is more expressive, higher is more even; 0.5 is the platform default. */
      stability?: number;
      similarity_boost?: number;
    };
  };
  platform_settings?: {
    data_collection?: DataCollectionConfig;
  };
}

export interface Agent {
  agent_id: string;
  name?: string;
  conversation_config: AgentConfig['conversation_config'];
}

export async function createAgent(config: AgentConfig): Promise<{ agent_id: string }> {
  return request<{ agent_id: string }>('/convai/agents/create', {
    method: 'POST',
    body: JSON.stringify(config),
  });
}

export async function getAgent(agentId: string): Promise<Agent> {
  return request<Agent>(`/convai/agents/${agentId}`, { method: 'GET' });
}

/** Partial update. Only the keys you pass are modified. */
export async function updateAgent(
  agentId: string,
  patch: Partial<AgentConfig>,
): Promise<Agent> {
  return request<Agent>(`/convai/agents/${agentId}`, {
    method: 'PATCH',
    body: JSON.stringify(patch),
  });
}

/* ------------------------------------------------------------------- tools */

/**
 * A tool the *browser* executes. ElevenLabs relays the call over the open
 * WebSocket to the client SDK; nothing runs on our server, which is why this
 * works on Vercel with no extra endpoint.
 */
export interface ClientToolConfig {
  type: 'client';
  name: string;
  description: string;
  response_timeout_secs?: number;
  /** When true the agent waits for the browser's return value before speaking. */
  expects_response?: boolean;
  parameters: {
    type: 'object';
    properties: Record<string, { type: string; description: string }>;
    required?: string[];
  };
}

export interface ToolRecord {
  id: string;
  tool_config: { name: string; type: string };
}

export async function listTools(): Promise<{ tools: ToolRecord[] }> {
  return request<{ tools: ToolRecord[] }>('/convai/tools', { method: 'GET' });
}

export async function createTool(config: ClientToolConfig): Promise<ToolRecord> {
  return request<ToolRecord>('/convai/tools', {
    method: 'POST',
    body: JSON.stringify({ tool_config: config }),
  });
}

export async function updateTool(
  toolId: string,
  config: ClientToolConfig,
): Promise<ToolRecord> {
  return request<ToolRecord>(`/convai/tools/${toolId}`, {
    method: 'PATCH',
    body: JSON.stringify({ tool_config: config }),
  });
}

/* ------------------------------------------------------------ conversation */

/**
 * Short-lived signed URL that lets the browser open a WebSocket to the agent
 * without ever seeing the API key.
 */
export async function getSignedUrl(agentId: string): Promise<string> {
  const res = await request<{ signed_url: string }>('/convai/conversation/get-signed-url', {
    method: 'GET',
    query: { agent_id: agentId },
  });
  return res.signed_url;
}

export interface ConversationSummary {
  conversation_id: string;
  agent_id: string;
  start_time_unix_secs: number;
  call_duration_secs: number;
  message_count: number;
  status: string;
}

export async function listConversations(
  agentId: string,
  pageSize = 30,
): Promise<{ conversations: ConversationSummary[] }> {
  return request<{ conversations: ConversationSummary[] }>('/convai/conversations', {
    method: 'GET',
    query: { agent_id: agentId, page_size: pageSize },
  });
}

export interface ConversationDetail {
  conversation_id: string;
  /** 'done' once the call has ended and been processed; only then is analysis present. */
  status: string;
  metadata?: { start_time_unix_secs?: number };
  /**
   * ElevenLabs writes this automatically after every finished call. The
   * summary prose is typically English regardless of the call's language.
   */
  analysis?: {
    transcript_summary?: string | null;
    call_summary_title?: string | null;
    /**
     * One entry per field declared in `platform_settings.data_collection`.
     * `value` is null when the call gave the extractor nothing to work with,
     * which for a commitment is the common and correct case — plenty of
     * conversations end without one.
     */
    data_collection_results?: Record<
      string,
      { value?: string | number | boolean | null; rationale?: string | null } | null
    > | null;
  } | null;
}

export async function getConversation(conversationId: string): Promise<ConversationDetail> {
  return request<ConversationDetail>(`/convai/conversations/${conversationId}`, {
    method: 'GET',
  });
}
