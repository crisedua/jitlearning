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

/**
 * What OpenRouter reports about a call once it has finished.
 *
 * Split out from the text on purpose: the text arrives token by token and this
 * arrives once, at the end, which is the ordering the whole billing path is
 * built around.
 */
export interface CallUsage {
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

export interface ChatOptions {
  model: string;
  messages: readonly ChatMessage[];
  /** Hard ceiling on the answer. A voice class cannot absorb an essay. */
  maxTokens?: number;
  /** Abort budget in milliseconds. */
  timeoutMs?: number;
}

/**
 * A call to a practice model, streamed.
 *
 * Yields text as it arrives and resolves the usage once, at the end. That
 * ordering is the whole difficulty: the price of the call is only known after
 * the last token, so the ledger write and the meter update cannot happen until
 * the stream closes — including when it closes badly. `onDone` therefore fires
 * on every exit path, with whatever was learned, and the caller bills from it.
 *
 * ## Why stream at all
 *
 * The first version of the bench did not stream, on the argument that the learner is
 * waiting for the teacher's reaction rather than the text, and the reaction
 * cannot start until the answer is whole. That argument is sound about the
 * teaching and wrong about the waiting: fifteen seconds of a motionless panel
 * in the middle of a ten-minute class reads as broken, and a learner who thinks
 * it broke presses the button again, which bills twice.
 *
 * The teacher still receives the answer whole, after the stream ends. Nothing
 * about the coaching changed; only what the learner watches while it happens.
 */
export interface StreamHandlers {
  onText: (chunk: string) => void;
  onDone: (usage: CallUsage) => void;
}

export async function chatStream(
  options: ChatOptions,
  handlers: StreamHandlers,
): Promise<void> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), options.timeoutMs ?? 90_000);

  let usage: CallUsage = {
    costUsd: null,
    promptTokens: null,
    completionTokens: null,
    model: null,
  };

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
        stream: true,
        /*
         * Without this the streamed response carries no usage chunk at all and
         * every practice message would be billed from an estimate. It is the
         * same flag the non-streaming call sends, and it is the reason this
         * provider was chosen.
         */
        usage: { include: true },
        plugins: [{ id: 'file-parser' }],
      }),
      signal: controller.signal,
    });

    if (!res.ok) throw new OpenRouterError(res.status, await res.text());
    if (!res.body) throw new OpenRouterError(res.status, 'The response carried no body to read.');

    const reader = res.body.getReader();
    const decoder = new TextDecoder();
    let buffer = '';

    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      buffer += decoder.decode(value, { stream: true });

      /*
       * SSE frames are separated by a blank line, and a chunk from the network
       * can end anywhere — including inside a JSON payload. Everything up to
       * the last separator is complete; the remainder stays in the buffer.
       */
      const frames = buffer.split('\n\n');
      buffer = frames.pop() ?? '';

      for (const frame of frames) {
        for (const line of frame.split('\n')) {
          if (!line.startsWith('data:')) continue;
          const payload = line.slice(5).trim();
          if (!payload || payload === '[DONE]') continue;

          let parsed: StreamChunk;
          try {
            parsed = JSON.parse(payload) as StreamChunk;
          } catch {
            // OpenRouter sends `: OPENROUTER PROCESSING` comment frames as a
            // keep-alive. Anything unparseable is skipped rather than fatal:
            // dropping one frame costs a few characters, throwing costs the
            // whole answer the learner is watching arrive.
            continue;
          }

          if (parsed.error?.message) throw new OpenRouterError(200, parsed.error.message);

          const text = parsed.choices?.[0]?.delta?.content;
          if (text) handlers.onText(text);

          if (parsed.model) usage.model = parsed.model;
          if (parsed.usage) {
            usage = {
              model: parsed.model ?? usage.model,
              costUsd: numberOrNull(parsed.usage.cost),
              promptTokens: numberOrNull(parsed.usage.prompt_tokens),
              completionTokens: numberOrNull(parsed.usage.completion_tokens),
            };
          }
        }
      }
    }
  } finally {
    clearTimeout(timer);
    /*
     * In `finally`, so a thrown error still bills. A call that failed halfway
     * has already been generated and charged by the provider, and a ledger that
     * only counts the calls that worked cannot be reconciled against an invoice
     * that counts all of them.
     */
    handlers.onDone(usage);
  }
}

interface StreamChunk {
  choices?: { delta?: { content?: string | null } }[];
  usage?: { prompt_tokens?: number; completion_tokens?: number; cost?: number };
  model?: string;
  error?: { message?: string };
}

function numberOrNull(value: unknown): number | null {
  return typeof value === 'number' && Number.isFinite(value) ? value : null;
}
