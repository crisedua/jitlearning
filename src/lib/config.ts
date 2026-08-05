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
 * `ELEVENLABS_AGENT_ID` is still read as a fallback for the estrategia coach,
 * which is what the single-coach deployment was. Without it, shipping this
 * change would take the live coach down until the new variables were set — and
 * a deploy that only goes right if two systems are updated in the same second
 * is a deploy that goes wrong.
 */
export function agentId(coach: Coach): string | undefined {
  const id = process.env[coach.envKey]?.trim();
  if (id) return id;
  if (coach.id === 'estrategia') return process.env.ELEVENLABS_AGENT_ID?.trim() || undefined;
  return undefined;
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
