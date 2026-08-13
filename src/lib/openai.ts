/**
 * Thin, typed wrapper over the OpenAI Responses API — only the surface the
 * pain radar needs.
 *
 * Hand-rolled like the ElevenLabs and Apify clients, and for the same reason:
 * the app uses one endpoint with a handful of options, and an SDK would be a
 * dependency tracking a moving target to save thirty lines of fetch.
 *
 * The one non-obvious part of the raw REST shape: there is no `output_text`
 * convenience field (that is an SDK affordance). The response carries an
 * `output[]` array of items — reasoning, web search calls, messages — and the
 * text lives in message items' `content[]` entries of type `output_text`,
 * which must be walked and concatenated.
 */

const BASE_URL = 'https://api.openai.com/v1';

/**
 * Chosen for cost: a radar run makes two calls with 10–12 web searches and
 * tens of thousands of tokens, and the discovery quality comes from the
 * search results and the prompt rules more than from model depth. Swap to
 * gpt-5 if the curation stage starts missing obvious noise.
 */
const MODEL = 'gpt-5-mini';

export class OpenAIError extends Error {
  constructor(
    readonly status: number,
    readonly body: string,
  ) {
    super(`OpenAI ${status}: ${body.slice(0, 300)}`);
    this.name = 'OpenAIError';
  }
}

function apiKey(): string {
  const key = process.env.OPENAI_API_KEY;
  if (!key) {
    throw new Error(
      'OPENAI_API_KEY is not set. Add it to .env.local (and to Vercel for the admin button).',
    );
  }
  return key;
}

/** Whether the radar IA can run at all in this deployment. */
export function openaiConfigured(): boolean {
  return Boolean(process.env.OPENAI_API_KEY);
}

export interface ResponsesUsage {
  input_tokens: number;
  output_tokens: number;
}

export interface CreateResponseOptions {
  /** The system prompt. */
  instructions: string;
  /** The user content. */
  input: string;
  /** Attach the hosted web_search tool. */
  webSearch?: boolean;
  /**
   * Kept low on search stages deliberately (the sibling app's finding): the
   * searches do the discovery and the prompt rules carry the quality, while
   * high effort mostly adds latency against the route's deadline.
   */
  reasoningEffort?: 'low' | 'medium' | 'high';
  maxOutputTokens?: number;
  /** Structured output: forces the reply to validate against this schema. */
  jsonSchema?: { name: string; schema: Record<string, unknown> };
  /**
   * Force at least one tool call before answering. Without it, the first
   * production run answered with a *plan* to search ("Sí, procede: inicia
   * hasta 12 búsquedas…") and never touched the web — $0.03, zero findings.
   */
  requireTool?: boolean;
  /** Per-attempt deadline. Retries get the same budget again. */
  timeoutMs?: number;
}

export interface ResponseResult {
  text: string;
  usage: ResponsesUsage;
  /** How many web_search calls the run made, for the cost estimate. */
  webSearches: number;
}

/** Shape of the raw response, reduced to the fields walked below. */
interface RawResponse {
  status?: string;
  usage?: { input_tokens?: number; output_tokens?: number };
  output?: Array<{
    type?: string;
    content?: Array<{ type?: string; text?: string }>;
  }>;
}

function extractText(raw: RawResponse): string {
  return (raw.output ?? [])
    .filter((item) => item.type === 'message')
    .flatMap((item) => item.content ?? [])
    .filter((c) => c.type === 'output_text')
    .map((c) => c.text ?? '')
    .join('');
}

/**
 * One call to the Responses API, with retries.
 *
 * Retryable: network failures, 408/429/5xx, an `incomplete` status, and —
 * learned from the sibling app — a `completed` status with no text, which
 * happens when reasoning plus search eat the whole output budget. Two retries
 * with backoff; a third failure is the caller's problem to report.
 */
export async function createResponse(opts: CreateResponseOptions): Promise<ResponseResult> {
  const body = {
    model: MODEL,
    instructions: opts.instructions,
    input: opts.input,
    max_output_tokens: opts.maxOutputTokens ?? 32_000,
    ...(opts.webSearch
      ? {
          tools: [{ type: 'web_search' }],
          ...(opts.requireTool ? { tool_choice: 'required' as const } : {}),
        }
      : {}),
    ...(opts.reasoningEffort ? { reasoning: { effort: opts.reasoningEffort } } : {}),
    ...(opts.jsonSchema
      ? {
          text: {
            format: {
              type: 'json_schema',
              name: opts.jsonSchema.name,
              schema: opts.jsonSchema.schema,
              strict: true,
            },
          },
        }
      : {}),
  };

  const timeout = opts.timeoutMs ?? 150_000;
  const backoffs = [2_000, 8_000];
  let lastError: Error = new Error('unreachable');

  for (let attempt = 0; attempt <= backoffs.length; attempt++) {
    try {
      const res = await fetch(`${BASE_URL}/responses`, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${apiKey()}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(body),
        signal: AbortSignal.timeout(timeout),
      });

      if (!res.ok) {
        const text = await res.text();
        // 4xx other than rate limiting is a bug in our request; retrying the
        // same payload would fail the same way, so fail fast and loudly.
        if (res.status !== 408 && res.status !== 429 && res.status < 500) {
          throw new OpenAIError(res.status, text);
        }
        lastError = new OpenAIError(res.status, text);
      } else {
        const raw = (await res.json()) as RawResponse;
        const text = extractText(raw);
        if (raw.status === 'completed' && text.trim()) {
          return {
            text,
            usage: {
              input_tokens: raw.usage?.input_tokens ?? 0,
              output_tokens: raw.usage?.output_tokens ?? 0,
            },
            webSearches: (raw.output ?? []).filter((i) => i.type === 'web_search_call').length,
          };
        }
        lastError = new Error(
          raw.status === 'completed'
            ? 'La respuesta llegó vacía (el razonamiento consumió el presupuesto de tokens).'
            : `La corrida terminó como "${raw.status}".`,
        );
      }
    } catch (err) {
      if (err instanceof OpenAIError) throw err;
      lastError = err instanceof Error ? err : new Error(String(err));
    }

    if (attempt < backoffs.length) {
      await new Promise((r) => setTimeout(r, backoffs[attempt]));
    }
  }

  throw lastError;
}

/**
 * Rough cost of a run, for the log line. Prices as of August 2026:
 * gpt-5-mini $0.25 / $2.00 per million input/output tokens; hosted web search
 * about $10 per thousand calls. An estimate to keep the operator oriented,
 * not an invoice.
 */
export function estimateUsd(usage: ResponsesUsage, webSearches = 0): number {
  return (
    (usage.input_tokens / 1_000_000) * 0.25 +
    (usage.output_tokens / 1_000_000) * 2.0 +
    (webSearches / 1_000) * 10
  );
}
