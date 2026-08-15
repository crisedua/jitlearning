/** Environment-derived configuration. No filesystem, no local state. */
import type { Coach } from './coaches';
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
 * The agent id is env-only, one variable per coach. `npm run setup:agent`
 * prints them; you set them in Vercel's project settings. Nothing is written
 * back at runtime, which is what lets every instance stay stateless.
 *
 * No legacy fallback any more. The old one pointed `ELEVENLABS_AGENT_ID` at the
 * strategy coach, and that coach is retired: inheriting its agent would give a
 * PMP learner an agent still carrying another subject's persona and attachment
 * list, which is worse than a clear error saying the variable is unset.
 */
export function agentId(coach: Coach): string | undefined {
  return process.env[coach.envKey]?.trim() || undefined;
}

/**
 * Retrieval strictness, per coach.
 *
 * One number decides whether a chunk counts as relevant, and the right value
 * is not the same for both corpora. PMP material is terminology-dense and
 * internally similar, so a loose gate drags competency prose into a question
 * about integrated change control. Employability answers lean mostly on
 * general knowledge over a small, varied corpus, where a tight gate returns
 * nothing at all and the supplement never fires.
 *
 * The failure when this is too tight is the dangerous one: the agent retrieves
 * nothing, answers from general knowledge, and sounds exactly as confident. The
 * honesty rule in the persona is what keeps that honest, but a coach that never
 * retrieves is a coach whose corpus is decorative.
 */
const DEFAULT_MAX_VECTOR_DISTANCE = 0.8;

export function maxVectorDistance(coach: Coach): number {
  const override = Number(process.env[`${coach.envKey}_MAX_VECTOR_DISTANCE`]);
  if (Number.isFinite(override) && override > 0) return override;
  return coach.maxVectorDistance ?? DEFAULT_MAX_VECTOR_DISTANCE;
}

export function requireAgentId(coach: Coach): string {
  const id = agentId(coach);
  if (!id) {
    throw new Error(
      `${coach.envKey} is not set. Run \`npm run setup:agent -- ${coach.id}\` and add the printed id to your environment.`,
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
