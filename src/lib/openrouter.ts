/**
 * Thin, typed client over OpenRouter's chat completions — only the surface the
 * practice bench needs.
 *
 * Hand-rolled like the ElevenLabs, Anthropic and Apify clients, and for the
 * same reason: one endpoint, a handful of options, and an SDK would be a
 * dependency tracking a moving target to save forty lines of fetch.
 *
 * ## Why one provider instead of three
 *
 * The bench offers Gemini, Claude and ChatGPT. Direct would be three API keys,
 * three request shapes, three attachment encodings and three billing dashboards
 * to reconcile against one learner's allowance. OpenRouter is one of each, and
 * the thing that decided it: **it returns the real cost of the call**. Every
 * other route to metering means maintaining a price table for nine models that
 * change price without telling us, and a stale price table on a metered product
 * is a slow, silent overcharge of the people paying us.
 *
 * The trade is a hop we do not control in front of an answer the learner is
 * waiting on. Acceptable here because nothing in the bench is load-bearing for
 * the class: the voice teacher keeps teaching when this fails, which is why
 * every failure below resolves to a sentence rather than an exception.
 */

const BASE_URL = 'https://openrouter.ai/api/v1';

/**
 * Sent as `HTTP-Referer` and `X-Title`, which is how OpenRouter attributes
 * traffic on their side. Not required; worth setting so a bill can be read.
 */
const APP_URL = 'https://www.modojit.com';
const APP_TITLE = 'ModoJIT';

export class OpenRouterError extends Error {
  constructor(
    readonly status: number,
    readonly body: string,
  ) {
    super(`OpenRouter ${status}: ${body.slice(0, 300)}`);
    this.name = 'OpenRouterError';
  }
}

function apiKey(): string {
  const key = process.env.OPENROUTER_API_KEY;
  if (!key) {
    throw new Error(
      'OPENROUTER_API_KEY is not set. Add it to .env.local (and to Vercel, or the practice bench is off in production).',
    );
  }
  return key;
}

/** Whether the bench can run at all in this deployment. */
export function openrouterConfigured(): boolean {
  return Boolean(process.env.OPENROUTER_API_KEY?.trim());
}

// ------------------------------------------------------------- the shapes ---

/**
 * A content part, in the subset the bench sends.
 *
 * Text and images are the same shape everywhere. `file` is OpenRouter's own:
 * a base64 data URL that it routes to the model's native document support, or
 * extracts itself for models without any. That is what lets a PDF go to all
 * three families from one request body.
 */
export type ContentPart =
  | { type: 'text'; text: string }
  | { type: 'image_url'; image_url: { url: string } }
  | { type: 'file'; file: { filename: string; file_data: string } };

export interface ChatMessage {
  role: 'system' | 'user' | 'assistant';
  content: string | ContentPart[];
}

export interface ChatResult {
  text: string;
  /**
   * What OpenRouter says the call cost, in USD, or null when it did not say.
   *
   * Null is not zero and must not be treated as zero by the caller: it means
   * the ledger did not learn the price of a call that happened. See how
   * `/api/practica` handles it — a floor, not a free ride.
   */
  costUsd: number | null;
  promptTokens: number | null;
  completionTokens: number | null;
  /** Which model actually served it. OpenRouter may fall back within a family. */
  model: string | null;
}

interface CompletionResponse {
  choices?: { message?: { content?: string | null } }[];
  usage?: {
    prompt_tokens?: number;
    completion_tokens?: number;
    cost?: number;
  };
  model?: string;
  error?: { message?: string };
}

// --------------------------------------------------------------- the call ---

export interface ChatOptions {
  model: string;
  messages: readonly ChatMessage[];
  /** Hard ceiling on the answer. A voice class cannot absorb an essay. */
  maxTokens?: number;
  /** Abort budget in milliseconds. */
  timeoutMs?: number;
}

export async function chat(options: ChatOptions): Promise<ChatResult> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), options.timeoutMs ?? 90_000);

  try {
    const res = await fetch(`${BASE_URL}/chat/completions`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${apiKey()}`,
        'Content-Type': 'application/json',
        'HTTP-Referer': APP_URL,
        'X-Title': APP_TITLE,
      },
      body: JSON.stringify({
        model: options.model,
        messages: options.messages,
        max_tokens: options.maxTokens ?? 2_000,
        /*
         * The reason this provider was chosen. Without it the response carries
         * token counts and no price, and pricing them ourselves means a table
         * of nine models' rates that goes stale silently.
         */
        usage: { include: true },
        /*
         * PDF handling, left on OpenRouter's default on purpose, with the cost
         * of that default written down because it is not obvious.
         *
         * With no `pdf.engine` named, OpenRouter uses the model's own file
         * support first and falls back to `mistral-ocr` when there is none.
         * All three families here take files natively, so the fallback should
         * never fire — but if one is ever swapped for a model that does not,
         * OCR is billed per page to our OpenRouter account whatever key is in
         * play. It reaches us as part of `usage.cost`, so the learner's meter
         * stays correct; what would change without anybody deciding it is how
         * much a practice message costs.
         *
         * The alternative, pinning `cloudflare-ai`, is free and always parses —
         * which also means never using the native support that reads a PDF
         * better than an extraction of it. Native is the right default for
         * these three; revisit if the model list changes.
         */
        plugins: [{ id: 'file-parser' }],
      }),
      signal: controller.signal,
    });

    const body = await res.text();
    if (!res.ok) throw new OpenRouterError(res.status, body);

    let parsed: CompletionResponse;
    try {
      parsed = JSON.parse(body) as CompletionResponse;
    } catch {
      throw new OpenRouterError(res.status, body);
    }

    /*
     * A 200 carrying an error object. OpenRouter answers this way when a
     * downstream provider refuses — content filter, region, a model that has
     * been retired — and reading only `res.ok` turns that into an empty answer
     * with no explanation anywhere.
     */
    if (parsed.error?.message) throw new OpenRouterError(200, parsed.error.message);

    const text = parsed.choices?.[0]?.message?.content?.trim() ?? '';

    return {
      text,
      costUsd: numberOrNull(parsed.usage?.cost),
      promptTokens: numberOrNull(parsed.usage?.prompt_tokens),
      completionTokens: numberOrNull(parsed.usage?.completion_tokens),
      model: parsed.model ?? null,
    };
  } finally {
    clearTimeout(timer);
  }
}

function numberOrNull(value: unknown): number | null {
  return typeof value === 'number' && Number.isFinite(value) ? value : null;
}
