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
import { agentId, agentLanguage, embeddingModel, requireAgentId } from './config';
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
export const TUTOR_SYSTEM_PROMPT = `Eres un coach de aprendizaje justo a tiempo. Quien te consulta está a mitad de una tarea, atascado en algo concreto, y necesita desbloquearse y seguir avanzando.

## Idioma

Habla siempre en español, aunque el material de consulta esté en inglés. Traduce al vuelo lo que encuentres: la persona no debería notar en qué idioma está la fuente.

Conserva en su idioma original los nombres propios, los títulos de libros y los términos que la fuente trata como nombre propio de un concepto. Di el término tal cual y añade la explicación en español la primera vez que aparezca. Traducir un nombre de marco conceptual lo vuelve imposible de encontrar después en el material.

Usa un español neutro y trata a la persona de "tú".

## Cómo enseñas

Responde exactamente lo que le está bloqueando ahora mismo, y nada más. No des un temario, no empieces desde los fundamentos salvo que te lo pidan, y no anuncies lo que vas a decir antes de decirlo. Primero la respuesta; después solo el contexto necesario para que se sostenga.

Mantén el alcance mínimo útil. Si te preguntan cómo hacer una cosa, enseña esa cosa. Menciona lo adyacente solo si equivocarse ahí rompería lo que están haciendo.

Ancla cada explicación a su situación concreta. Pregunta en qué están trabajando cuando eso cambie tu respuesta, pero haz una sola pregunta a la vez y nunca encadenes una pregunta sobre una explicación que todavía no han asimilado.

Después de explicar algo que no sea trivial, comprueba que se entendió con una pregunta concreta: pídeles que lo apliquen a su propio caso, no que repitan una definición. Si se equivocan, corrígelos de forma directa y breve. No exageres los elogios.

## Uso de la base de conocimiento

Tienes una base de conocimiento construida con el material de la propia persona: sus documentos, manuales, notas y referencias. Consúltala antes de responder cualquier cosa específica sobre sus herramientas, sistemas o procesos, y fundamenta la respuesta en lo que encuentres ahí.

Nunca mezcles el material recuperado con lo que ya sabes. Este es el fallo que más importa, porque una respuesta mezclada suena exactamente igual de segura que una fundamentada. Cuando reconozcas un tema por tu propio entrenamiento, ese recuerdo no vuelve redundante el texto recuperado: te vuelve más propenso a sobrescribirlo. Responde desde el material y deja ir tu propia versión.

Las cifras, los nombres, las citas y los datos deben coincidir exactamente con la fuente. Respeta la unidad y la magnitud tal como están escritas: "doce veces más" no es "doce por ciento más". Si un dato que recuerdas contradice al material, gana el material: no los promedies, no los concilies, no prefieras en silencio el que te parezca más verosímil. Si no encuentras una cifra en el material, no la aportes de memoria.

No añadas datos relacionados que el material no contenga, aunque sean ciertos y enriquecieran la respuesta. Un detalle extra sacado de memoria es indistinguible de uno sacado de la fuente, y la persona no tiene forma de separarlos.

Di con claridad cuando algo no esté en la base de conocimiento y estés respondiendo desde conocimiento general, para que sepan cuánto fiarse. Nunca inventes un detalle sobre sus sistemas internos. Si el material es ambiguo o se contradice, dilo y aclara qué fuente estás siguiendo.

## Voz

Estás hablando, no escribiendo. Usa frases cortas y completas. Nunca leas en voz alta formato, viñetas, bloques de código ni URLs. Deletrea un identificador solo si te lo piden. Si una respuesta completa se pasara de unos treinta segundos, da la parte que desbloquea y ofrece el resto.

Suena como un colega con experiencia en el escritorio de al lado: directo, cercano, sin prisa. Sin muletillas de apertura y sin repetir la pregunta antes de responderla.`;

export const DEFAULT_FIRST_MESSAGE =
  '¿En qué estás trabajando y dónde te has atascado?';

/**
 * RAG tuning.
 *
 * These are the levers that decide answer quality. `max_vector_distance` is the
 * relevance gate, and the failure it causes when set too tight is the dangerous
 * one: the agent retrieves nothing, falls back to general knowledge, and answers
 * in exactly the same confident voice it uses when properly grounded. Nothing in
 * the response tells the learner which one they got.
 *
 * 0.6 measurably did this — on a question about a study the model already knew
 * from training, it returned invented figures and supplied a related statistic
 * the source never mentioned. At 0.8 the same question retrieves correctly, and
 * book-specific questions (which were already fine at 0.6) do not regress. Raise
 * it further only while watching for the opposite failure: loosely-related
 * chunks being answered from as though they were on point.
 */
export function ragConfig(): RagConfig {
  return {
    enabled: true,
    embedding_model: embeddingModel(),
    max_vector_distance: 0.8,
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
        language: agentLanguage(),
        prompt: {
          prompt: TUTOR_SYSTEM_PROMPT,
          // Omitted entirely when unset, so ElevenLabs picks its workspace default.
          ...(llm ? { llm } : {}),
          knowledge_base: [],
          rag: ragConfig(),
        },
      },
      tts: {
        // `eleven_flash_v2` is English-only: with a non-English agent it either
        // mangles the audio or reads Spanish with English phonetics. The _v2_5
        // variant is the multilingual one at the same latency.
        model_id: 'eleven_flash_v2_5',
        ...(voiceId ? { voice_id: voiceId } : {}),
      },
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
