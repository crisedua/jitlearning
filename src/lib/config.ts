/** Environment-derived configuration. No filesystem, no local state. */
import { TEACHER } from './teacher';
import type { EmbeddingModel } from './types';

/**
 * Multilingual by default.
 *
 * The coach speaks Spanish while the source material is largely English, so
 * retrieval has to work across languages: a Spanish question must match an
 * English passage. `e5_mistral_7b_instruct` scores higher on English-only
 * corpora but embeds the two languages far enough apart that cross-lingual
 * queries miss, and a retrieval miss here is silent — the agent answers from
 * general knowledge in the same confident voice.
 *
 * Changing this invalidates every existing index. Re-index the whole knowledge
 * base after switching, or documents embedded under the old model become
 * unreachable without any error to tell you so.
 */
export function embeddingModel(): EmbeddingModel {
  return process.env.ELEVENLABS_EMBEDDING_MODEL === 'e5_mistral_7b_instruct'
    ? 'e5_mistral_7b_instruct'
    : 'multilingual_e5_large_instruct';
}

/**
 * Spoken language for the agent: drives speech recognition, the language the
 * model replies in, and which TTS voices are usable.
 */
export function agentLanguage(): string {
  return process.env.ELEVENLABS_AGENT_LANGUAGE?.trim() || 'es';
}

/**
 * The agent id is env-only: `npm run setup:agent` prints it, you set it in
 * Vercel's project settings. Nothing is written back at runtime, which is what
 * lets every serverless instance stay stateless.
 *
 * One product, one agent, so one variable. The per-coach variables that used to
 * live here are gone; if `ELEVENLABS_AGENT_ID` still points at an agent from an
 * earlier product, set it to the new one rather than trusting the name.
 */
export function agentId(): string | undefined {
  return process.env[TEACHER.envKey]?.trim() || undefined;
}

/**
 * Retrieval strictness.
 *
 * One number decides whether a chunk counts as relevant. The failure when it is
 * too tight is the quiet one: the agent retrieves nothing, answers from general
 * knowledge, and sounds exactly as confident. The honesty rule in the persona is
 * what keeps that honest, but a teacher that never retrieves is a teacher whose
 * corpus is decorative. Overridable without a deploy while tuning.
 */
export function maxVectorDistance(): number {
  const override = Number(process.env.ELEVENLABS_MAX_VECTOR_DISTANCE);
  if (Number.isFinite(override) && override > 0) return override;
  return TEACHER.maxVectorDistance;
}

export function requireAgentId(): string {
  const id = agentId();
  if (!id) {
    throw new Error(
      `${TEACHER.envKey} is not set. Run \`npm run setup:agent\` and add the printed id to your environment.`,
    );
  }
  return id;
}

/**
 * Run an async mapper over items with bounded concurrency.
 *
 * Listing documents fans out one status request per document; unbounded that
 * would rate-limit on a large knowledge base and blow the function timeout.
 */
export async function mapWithConcurrency<T, R>(
  items: readonly T[],
  limit: number,
  fn: (item: T) => Promise<R>,
): Promise<R[]> {
  const results = new Array<R>(items.length);
  let cursor = 0;

  async function worker(): Promise<void> {
    while (cursor < items.length) {
      const index = cursor++;
      results[index] = await fn(items[index]!);
    }
  }

  await Promise.all(
    Array.from({ length: Math.min(limit, items.length) }, () => worker()),
  );
  return results;
}
