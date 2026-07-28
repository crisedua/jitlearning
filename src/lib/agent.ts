/**
 * Agent provisioning: the tutor persona, its RAG settings, and keeping its
 * attached knowledge base in sync with what we've ingested.
 */
import {
  createAgent,
  getAgent,
  updateAgent,
  type AgentConfig,
  type RagConfig,
} from './elevenlabs';
import { agentId, embeddingModel, requireAgentId } from './config';
import { attachableEntries } from './catalog';
import type { UsageMode } from './types';

/**
 * The tutor persona.
 *
 * Written for *voice*, which is the main constraint: no formatting, no lists
 * read aloud, short turns. The pedagogy is deliberately just-in-time — answer
 * the question that blocks the learner right now, then check it landed, rather
 * than delivering a curriculum.
 */
export const TUTOR_SYSTEM_PROMPT = `You are a just-in-time learning coach. Learners come to you mid-task, blocked on something specific, and they need to get unblocked and keep moving.

## How you teach

Answer the question that is actually blocking them, right now, and nothing else. Do not deliver a curriculum, do not start from first principles unless they ask, and do not preview what you are about to say. Lead with the answer, then add only the context needed to make it stick.

Keep the smallest useful scope. If someone asks how to do one thing, teach that one thing. Mention adjacent material only if getting it wrong would break what they are doing.

Anchor every explanation to their situation. Ask what they are working on when it changes your answer, but ask at most one question at a time and never stack a question on top of an explanation they have not absorbed yet.

After explaining something non-trivial, check that it landed with a concrete question — ask them to apply it to their own case, not to repeat back a definition. If they get it wrong, correct it directly and briefly. Do not over-praise.

## Using your knowledge base

You have a knowledge base built from the learner's own material — their docs, runbooks, notes and references. Search it before answering anything specific about their tools, systems or processes, and ground your answer in what you find there.

State plainly when something is not in the knowledge base and you are answering from general knowledge, so the learner knows how much to trust it. Never invent a detail about their internal systems. If the material is ambiguous or conflicting, say so and tell them which source you are following.

## Voice

You are speaking, not writing. Use short, complete sentences. Never read out formatting, bullet points, code blocks or URLs. Spell out an identifier only if they ask for it. If a full answer would run past about thirty seconds, give the part that unblocks them and offer the rest.

Sound like a knowledgeable colleague at the next desk: direct, warm, unhurried. No filler openers, no restating the question before answering it.`;

export const DEFAULT_FIRST_MESSAGE =
  "Hey — what are you working on, and where are you stuck?";

/**
 * RAG tuning.
 *
 * These are the levers that decide answer quality. `max_vector_distance` is the
 * relevance gate: too high and the agent pulls in loosely-related chunks and
 * confidently answers from them; too low and it finds nothing and falls back to
 * general knowledge. 0.6 is a sane starting point — tune it against real
 * questions before changing anything else.
 */
export function ragConfig(): RagConfig {
  return {
    enabled: true,
    embedding_model: embeddingModel(),
    max_vector_distance: 0.6,
    // Voice answers are short; a large retrieval budget mostly adds latency.
    max_documents_length: 12_000,
    max_retrieved_rag_chunks_count: 12,
  };
}

/**
 * Create the tutor agent. Returns the new id, which the caller must persist
 * into the environment — nothing is written back at runtime.
 */
export async function provisionAgent(): Promise<string> {
  const llm = process.env.ELEVENLABS_AGENT_LLM?.trim();
  const voiceId = process.env.ELEVENLABS_VOICE_ID?.trim();

  const config: AgentConfig = {
    name: 'JIT Learning Coach',
    conversation_config: {
      agent: {
        first_message: DEFAULT_FIRST_MESSAGE,
        language: 'en',
        prompt: {
          prompt: TUTOR_SYSTEM_PROMPT,
          // Omitted entirely when unset, so ElevenLabs picks its workspace default.
          ...(llm ? { llm } : {}),
          knowledge_base: [],
          rag: ragConfig(),
        },
      },
      ...(voiceId ? { tts: { voice_id: voiceId } } : {}),
    },
  };

  const { agent_id } = await createAgent(config);
  return agent_id;
}

/**
 * Push the current document set onto the agent.
 *
 * Call this after ingesting or deleting knowledge — the agent holds its own
 * copy of the attachment list, so new documents are invisible until synced.
 * Existing usage modes are preserved; `overrides` declares the mode for a
 * document that was just uploaded and isn't in the agent config yet.
 */
export async function syncAgentKnowledge(
  overrides: ReadonlyMap<string, UsageMode> = new Map(),
): Promise<{ agentId: string; attached: number }> {
  const id = requireAgentId();
  const entries = await attachableEntries(overrides);
  const llm = process.env.ELEVENLABS_AGENT_LLM?.trim();

  await updateAgent(id, {
    conversation_config: {
      agent: {
        prompt: {
          prompt: TUTOR_SYSTEM_PROMPT,
          ...(llm ? { llm } : {}),
          knowledge_base: entries,
          rag: ragConfig(),
        },
      },
    },
  });

  return { agentId: id, attached: entries.length };
}

/** Fetch the live agent, or undefined if none is configured. */
export async function currentAgent() {
  const id = agentId();
  if (!id) return undefined;
  return getAgent(id);
}
