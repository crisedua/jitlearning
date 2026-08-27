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
    super(`ElevenLabs ${status} on ${endpoint}: ${redactSecrets(body)}`);
    this.name = 'ElevenLabsError';
  }
}

/**
 * Strip credentials out of an error message before anybody can read it.
 *
 * A validation error quotes the request back. `setup:tools` registers a webhook
 * tool whose config carries INGEST_SECRET as a header value, so a 422 from that
 * endpoint printed the live shared secret to the terminal — and from there into
 * a scrollback buffer, a CI log, or a screenshot pasted into a chat. That
 * happened here, and the secret had to be rotated.
 *
 * Long hex and base64-ish runs are the shape every credential in this project
 * takes: INGEST_SECRET is 32 bytes of hex, the ElevenLabs key is `sk_` and 32
 * more. Matching on shape rather than on a list of variable names is what makes
 * this hold for the next secret somebody adds without thinking about this file.
 *
 * Deliberately blunt. A message that has lost a harmless 40-character id is
 * still readable; one that has leaked a live secret cannot be unread.
 */
export function redactSecrets(text: string): string {
  return text
    .replace(/\bsk_[A-Za-z0-9_-]{8,}/g, 'sk_<redacted>')
    .replace(/\b[0-9a-f]{32,}\b/gi, '<redacted>');
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
  /**
   * The platform's own tools: `skip_turn`, `end_call`, `language_detection` and
   * the transfer family. A sibling of `tool_ids` and not the same field, so
   * nothing that counts `tool_ids` can see them.
   */
  built_in_tools?: Record<string, unknown> | null;
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

/**
 * Success criteria, judged per conversation by ElevenLabs after the call.
 *
 * `conversation_goal_prompt` is read by an evaluator that has the transcript, so
 * each one is written as a question with a definite answer rather than as a
 * quality rating: "did this happen" beats "how good was it" when the result is
 * going to be counted.
 */
export interface EvaluationCriterion {
  id: string;
  name: string;
  type: 'prompt';
  conversation_goal_prompt: string;
}

export interface AgentConfig {
  name?: string;
  conversation_config: {
    agent: {
      first_message?: string;
      language?: string;
      /**
       * Defaults for the `{{variables}}` the prompt and first message reference.
       *
       * Not decoration: a conversation started without supplying a referenced
       * variable fails outright, and the error surfaces to the learner as a
       * connection failure with no clue what caused it. These are what let the
       * agent be tested from the ElevenLabs dashboard, which supplies nothing.
       */
      dynamic_variables?: {
        dynamic_variable_placeholders?: Record<string, string>;
      };
      prompt: AgentPromptConfig;
    };
    tts?: {
      voice_id?: string;
      model_id?: string;
      /** 0–1. Lower is more expressive, higher is more even; 0.5 is the platform default. */
      stability?: number;
      similarity_boost?: number;
    };
    turn?: {
      /** How fast the turn-taking model decides the user has finished speaking. */
      turn_eagerness?: 'patient' | 'normal' | 'eager';
      /** Start generating while endpointing is still deciding; discarded if the user goes on. */
      speculative_turn?: boolean;
      /** Seconds of silence before the agent fills the gap. */
      turn_timeout?: number;
    };
    conversation?: {
      /**
       * Seconds before the platform ends the call, whatever either side is
       * saying. Left unset this takes ElevenLabs' own default, which is how a
       * ceiling nothing in this repo had chosen came to sit below every
       * wrap-up prompt the classroom schedules.
       */
      max_duration_seconds?: number;
    };
  };
  platform_settings?: {
    data_collection?: DataCollectionConfig;
    evaluation?: { criteria: EvaluationCriterion[] };
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
  /** Null totals the whole workspace, which is what the invoice covers. */
  agentId: string | null,
  pageSize = 30,
  cursor?: string,
): Promise<{
  conversations: ConversationSummary[];
  /** Pass back as `cursor` for the next page. Absent on the last one. */
  next_cursor?: string | null;
  has_more?: boolean;
}> {
  return request('/convai/conversations', {
    method: 'GET',
    query: { agent_id: agentId ?? undefined, page_size: pageSize, cursor },
  });
}

/* ------------------------------------------------------------ subscription */

/**
 * Which Agents plan this account is actually on.
 *
 * The one thing the cost model could not know and therefore never checked. It
 * projects what a given number of minutes *should* cost and picks the cheapest
 * tier; without this it had no idea which tier was being paid for, so it could
 * not notice the two disagreeing. They disagreed by $77 a month for over a
 * month.
 *
 * Read-only: `GET /v1/user/subscription` is the only subscription endpoint
 * ElevenLabs exposes. Changing the plan is a dashboard action, so the most this
 * can do is say which way to go.
 */
export interface Subscription {
  /** 'free' | 'starter' | 'creator' | 'pro' | 'scale' | 'business'. */
  tier: string;
  status?: string;
  character_count?: number;
  character_limit?: number;
}

export async function getSubscription(): Promise<Subscription> {
  return request('/user/subscription', { method: 'GET' });
}

/* ----------------------------------------------------------------- webhooks */

/**
 * A workspace webhook as ElevenLabs reports it.
 *
 * The last four fields are the interesting ones and are the reason this exists:
 * they are the only place that knows whether deliveries are actually landing.
 * Nothing inside the deployment can tell a signing secret that matches from one
 * that merely exists — the route refuses a wrong signature with a 401 that looks
 * exactly like a refusal of an attacker — and this is where that 401 is written
 * down.
 */
export interface WorkspaceWebhook {
  webhook_id: string;
  name?: string;
  webhook_url?: string;
  is_disabled?: boolean;
  /** True when ElevenLabs switched it off itself, after enough failures. */
  is_auto_disabled?: boolean;
  most_recent_failure_error_code?: number | null;
  most_recent_failure_timestamp?: number | null;
  retry_enabled?: boolean;
}

export async function listWorkspaceWebhooks(): Promise<{ webhooks: WorkspaceWebhook[] }> {
  return request('/workspace/webhooks', { method: 'GET' });
}

/**
 * Spoken minutes billed this calendar month, across every agent.
 *
 * The number the subscription should be sized against, taken from the side that
 * computes the invoice. `coach_sessions` is the wrong source for this even
 * though it is closer to hand: it counts only what this app minted a signed URL
 * for, misses anything tried in the ElevenLabs dashboard, and carries
 * self-reported durations until `sync:usage` reconciles them.
 *
 * `complete` is false when the page cap was reached before the start of the
 * month, so a caller can say the total is a floor instead of quoting it as
 * fact. The cap exists because an unbounded paging loop inside a diagnostic is
 * a hang.
 */
export async function minutesThisMonth(maxPages = 5): Promise<{
  minutes: number;
  complete: boolean;
}> {
  const now = new Date();
  const monthStart = Math.floor(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1) / 1000);

  let seconds = 0;
  let cursor: string | undefined;
  let reachedStart = false;

  for (let page = 0; page < maxPages; page++) {
    const batch = await listConversations(null, 100, cursor);
    for (const c of batch.conversations) {
      if (c.start_time_unix_secs >= monthStart) seconds += c.call_duration_secs ?? 0;
      else reachedStart = true;
    }
    cursor = batch.next_cursor ?? undefined;
    if (reachedStart || !batch.has_more || !cursor) {
      reachedStart = true;
      break;
    }
  }

  return { minutes: Math.round(seconds / 60), complete: reachedStart };
}

export interface ConvaiSettings {
  webhooks?: {
    post_call_webhook_id?: string | null;
    events?: string[] | null;
  } | null;
}

/** Which webhook, of the ones the workspace has, is the post-call one. */
export async function getConvaiSettings(): Promise<ConvaiSettings> {
  return request('/convai/settings', { method: 'GET' });
}

export interface ConversationDetail {
  conversation_id: string;
  /** 'done' once the call has ended and been processed; only then is analysis present. */
  status: string;
  metadata?: { start_time_unix_secs?: number };
  /**
   * The class, turn by turn.
   *
   * Left as `unknown` rather than typed out: each entry carries about thirty
   * fields — tool calls, token counts, latency metrics, guardrail flags — and
   * three of them are the conversation. `trimTurns` in `transcripts.ts` is the
   * one place that decides which three, and declaring the rest here would
   * invite somebody to reach for a metric that has no business on a page a
   * learner reads.
   */
  transcript?: unknown;
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
