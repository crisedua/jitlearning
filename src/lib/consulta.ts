/**
 * The teacher's way of looking something up.
 *
 * Claude with web search, behind one function. The agent calls it through a
 * server tool (`/api/ask`), asks a question in Spanish, and gets back a short
 * spoken answer plus the sources the search actually returned.
 *
 * ## Why this exists
 *
 * The corpus is three documents. Everything else the teacher says is general
 * knowledge, which the honesty rule makes it label as such: "esto es criterio
 * general, no una fuente que tenga a mano". That rule is honest and it is also a
 * ceiling. A learner asking what a tool costs, what employers in their field are
 * asking for, or whether a product still works the way the teacher described
 * gets a hedge, because the agent has no way to find out.
 *
 * This raises the ceiling without touching the honesty rule: when the answer
 * needs to come from outside, it comes from a real search with real sources, and
 * the teacher cites them out loud.
 *
 * ## The sources cannot be fabricated
 *
 * `sources` is read from the `web_search_tool_result` blocks in the response, not
 * from the model's prose. Those blocks are what the search engine returned, so a
 * URL in that list was fetched rather than composed. That is the whole design:
 * the one thing a language model is worst at (remembering a URL) is the one thing
 * we never ask it for.
 *
 * ## Written for voice
 *
 * The answer is capped at 3 sentences because it is going to be spoken while
 * somebody walks. Sources are returned separately, never read aloud: a URL in a
 * voice channel is noise. The notebook is where links belong.
 */
import Anthropic from '@anthropic-ai/sdk';

/**
 * Model and search budget.
 *
 * Opus 5 at `low` effort: on this model low and medium punch well above their
 * weight, and effort is the lever that decides whether a spoken turn arrives in
 * 8 seconds or 30. Thinking stays on (it is on by default here) because turning
 * it off on Opus 5 can put a tool call into the visible text instead of a tool
 * block, which for a search tool means the search silently never runs.
 *
 * Four searches is enough to answer a question about one product or one field
 * and cheap enough to run inside a conversation. Each search is billed per call,
 * so this is the number that decides the cost of a lookup.
 */
const MODEL = 'claude-opus-5';
const EFFORT = 'low' as const;
const MAX_SEARCHES = 4;
const MAX_TOKENS = 2_000;

/** Sentences the teacher can say before a learner stops listening. */
const MAX_SENTENCES = 3;

/** How many sources to hand back. More than this is a reading list, not an answer. */
const MAX_SOURCES = 4;

export interface Source {
  title: string;
  url: string;
  /** ISO date the page reports, when the search returns one. */
  publishedAt: string | null;
}

export interface Consulta {
  /** The spoken answer, at most 3 sentences. Empty when the model refused. */
  answer: string;
  /** What the search actually returned. Never composed by the model. */
  sources: Source[];
  /** How many searches ran. Zero means the answer came from general knowledge. */
  searches: number;
  /** Set when safety classifiers declined the request. */
  refusal: string | null;
  usage: { inputTokens: number; outputTokens: number };
}

export function consultaConfigured(): boolean {
  return Boolean(process.env.ANTHROPIC_API_KEY?.trim());
}

/**
 * The system prompt for the lookup, not for the teacher.
 *
 * Deliberately narrow: this call answers one question and returns. It does not
 * teach, does not ask follow-ups, and does not close on a commitment. Those are
 * the teacher's job, and the teacher is the one who receives this text and says
 * it in its own voice.
 */
const INSTRUCTIONS = `Eres el buscador de un profesor de IA que enseña por voz, en español. Recibes una pregunta y devuelves lo que encontraste, redactado para decirse en voz alta.

Reglas:

Busca antes de responder cuando la pregunta dependa de información actual: precios, versiones, qué piden los empleadores hoy, si una herramienta todavía existe o cambió. Si la pregunta no necesita búsqueda, responde directamente y no busques.

Responde en ${MAX_SENTENCES} frases como máximo, en español neutro, sin viñetas, sin encabezados y sin direcciones web. El profesor va a leer tu respuesta en voz alta: una URL dicha en voz alta es ruido.

Cuando des una cifra, un precio o una fecha, di de quién es: "según la página de precios de X", "según una oferta publicada en Y". Si la búsqueda no trajo la cifra, dilo y no la estimes.

Si lo que encontraste se contradice, dilo en una frase y di cuál fuente es más reciente.

Si no encontraste nada útil, dilo claramente en una frase. No rellenes.

Nunca escribas una URL en tu respuesta. Las fuentes viajan por separado.`;

/** Trim to whole sentences, so a cut answer never ends mid-word. */
function toSentences(text: string, limit: number): string {
  const clean = text.replace(/\s+/g, ' ').trim();
  const parts = clean.match(/[^.!?]+[.!?]+/g);
  if (!parts) return clean;
  return parts.slice(0, limit).join(' ').trim();
}

/**
 * Ask Claude, with search.
 *
 * Throws only on a configuration or transport failure. A refusal, an empty
 * result, or a search that found nothing all come back as a normal `Consulta`
 * with the relevant field set, because the caller is a voice tool: it needs
 * something to say, not an exception.
 */
export async function consultar(question: string, profile?: string): Promise<Consulta> {
  const apiKey = process.env.ANTHROPIC_API_KEY?.trim();
  if (!apiKey) throw new Error('ANTHROPIC_API_KEY is not configured.');

  const client = new Anthropic({ apiKey });

  const asked = profile
    ? `Pregunta: ${question}\n\nQuién pregunta: ${profile}. Ajusta la respuesta a su campo y su nivel.`
    : `Pregunta: ${question}`;

  /*
   * `fallbacks: "default"` is on because Opus 5 runs safety classifiers that
   * can decline a request, and a declined request here is a teacher going
   * silent mid-sentence. "default" routes by refusal category rather than
   * pinning a model, so this needs no maintenance when the recommended
   * fallback changes.
   */
  const response = await client.beta.messages.create({
    model: MODEL,
    max_tokens: MAX_TOKENS,
    betas: ['server-side-fallback-2026-07-01'],
    fallbacks: 'default',
    output_config: { effort: EFFORT },
    system: INSTRUCTIONS,
    tools: [{ type: 'web_search_20260209', name: 'web_search', max_uses: MAX_SEARCHES }],
    messages: [{ role: 'user', content: asked }],
  });

  if (response.stop_reason === 'refusal') {
    return {
      answer: '',
      sources: [],
      searches: 0,
      refusal: response.stop_details?.explanation ?? 'La consulta fue rechazada.',
      usage: {
        inputTokens: response.usage.input_tokens,
        outputTokens: response.usage.output_tokens,
      },
    };
  }

  const text: string[] = [];
  const sources: Source[] = [];
  let searches = 0;

  for (const block of response.content) {
    if (block.type === 'text') {
      text.push(block.text);
      continue;
    }

    if (block.type === 'web_search_tool_result') {
      searches += 1;

      /*
       * The content of a search result block is either a list of results or a
       * single error object, and the two are told apart by shape rather than by
       * a status field. Indexing without checking is how a rate-limited search
       * turns into a crash.
       */
      const content = block.content as unknown;
      if (!Array.isArray(content)) continue;

      for (const result of content) {
        const hit = result as { type?: string; title?: string; url?: string; page_age?: string };
        if (hit.type !== 'web_search_result' || !hit.url) continue;
        sources.push({
          title: hit.title?.trim() || hit.url,
          url: hit.url,
          publishedAt: hit.page_age?.trim() || null,
        });
      }
    }
  }

  // Same URL from two searches is one source.
  const unique = new Map(sources.map((s) => [s.url, s]));

  return {
    answer: toSentences(text.join(' '), MAX_SENTENCES),
    sources: [...unique.values()].slice(0, MAX_SOURCES),
    searches,
    refusal: null,
    usage: {
      inputTokens: response.usage.input_tokens,
      outputTokens: response.usage.output_tokens,
    },
  };
}
