/** Environment-derived configuration. No filesystem, no local state. */
import type { EmbeddingModel } from './types';

export function embeddingModel(): EmbeddingModel {
  return process.env.ELEVENLABS_EMBEDDING_MODEL === 'multilingual_e5_large_instruct'
    ? 'multilingual_e5_large_instruct'
    : 'e5_mistral_7b_instruct';
}

/**
 * The agent id is env-only. `npm run setup:agent` prints it once; you set it in
 * Vercel's project settings. Nothing is written back at runtime, which is what
 * lets every instance stay stateless.
 */
export function agentId(): string | undefined {
  return process.env.ELEVENLABS_AGENT_ID?.trim() || undefined;
}

export function requireAgentId(): string {
  const id = agentId();
  if (!id) {
    throw new Error(
      'ELEVENLABS_AGENT_ID is not set. Run `npm run setup:agent` and add the printed id to your environment.',
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
