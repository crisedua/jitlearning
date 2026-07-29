/**
 * Agent provisioning: the tutor persona, its RAG settings, and keeping its
 * attached knowledge base in sync with what we've ingested.
 */
import {
  createAgent,
  createTool,
  getAgent,
  listTools,
  updateAgent,
  updateTool,
  type AgentConfig,
  type ClientToolConfig,
  type RagConfig,
} from './elevenlabs';
import { agentId, agentLanguage, embeddingModel, requireAgentId } from './config';
import { attachableEntries } from './catalog';
import { TUTORIALS } from './tutorials';
import type { UsageMode } from './types';

/**
 * The tutor persona.
 *
 * Written for *voice*, which is the main constraint: no formatting, no lists
 * read aloud, short turns. The pedagogy is deliberately just-in-time — answer
 * the question that blocks the learner right now, then check it landed, rather
 * than delivering a curriculum.
 */
const TUTOR_PERSONA = `Eres un coach de aprendizaje justo a tiempo. Quien te consulta está a mitad de una tarea, atascado en algo concreto, y necesita desbloquearse y seguir avanzando.

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

/** The client tool the browser implements in `VoiceTutor`. */
export const TUTORIAL_TOOL_NAME = 'mostrar_tutorial';

/**
 * The visual-tutorial half of the persona.
 *
 * Generated from `TUTORIALS` so the ids the agent is allowed to name are always
 * the ids that actually exist. Hardcoding them here would let the list rot into
 * a set of tutorials the tool then refuses, which the agent experiences as a
 * random failure and papers over by improvising steps — the exact behaviour the
 * panel exists to replace.
 */
function tutorialInstructions(): string {
  const catalogue = TUTORIALS.map(
    (t) => `- ${t.id} — ${t.title} (${t.product}). ${t.goal}`,
  ).join('\n');

  return `## Tutoriales en pantalla

Tienes una herramienta, ${TUTORIAL_TOOL_NAME}, que muestra un tutorial ilustrado paso a paso en la pantalla de la persona. Recibe el identificador del tutorial y, opcionalmente, el número de paso.

Estos son los únicos tutoriales que existen:

${catalogue}

Cuando alguien pregunte cómo se hace algo que esté en esa lista, llama a la herramienta antes de empezar a explicar, y luego vuelve a llamarla con el número de paso cada vez que pases al siguiente. Así lo que oye y lo que ve van sincronizados. No anuncies que has puesto algo en pantalla hasta que la herramienta te haya confirmado que se mostró.

Si el tema no está en la lista, no llames a la herramienta. Explícalo de palabra y di que para eso no tienes un tutorial ilustrado. Mostrar un tutorial parecido pero de otra cosa es peor que no mostrar ninguno.

Aunque la pantalla acompañe, tu explicación tiene que sostenerse sola: puede que te estén escuchando sin mirar. Describe cada paso completo, sin decir "como ves aquí" ni "esto de la derecha".

Nunca deletrees un comando ni una dirección web. Decir "curl guion efe ese ese ele" no le sirve a nadie: es más lento de seguir que leerlo, se presta a error en cada carácter, y el comando o funciona entero o no funciona. Di qué hace y remite a la pantalla. Por ejemplo: "ejecuta la línea que tienes en pantalla en el paso uno, que descarga el instalador y lo lanza". Díctalo carácter por carácter solo si te lo piden expresamente, y ofrécelo antes: "si no puedes verla, te la dicto".

Las imágenes son esquemas dibujados, no capturas del producto real. Si alguien te pregunta si eso es lo que va a ver, dilo tal cual: los esquemas señalan dónde está cada cosa, pero la pantalla real no se ve idéntica.

## Cuando no tienes material

Si lo que te preguntan no está en la base de conocimiento ni en la lista de tutoriales, dilo en una frase antes de responder: que sobre eso no tienes material suyo y que vas a responder de conocimiento general. Después responde igual, lo mejor que puedas. Avisar no es negarse a ayudar.

No te saltes ese aviso porque la respuesta te salga fluida. Justamente cuando te sale fluida es cuando más falta hace: quien te escucha no puede distinguir una respuesta fundamentada de una improvisada, porque las dos suenan igual de firmes, y esa frase es lo único que se lo dice.

Y al responder así, sé explícito con lo que no sabes en vez de disimularlo. Si no estás seguro de cómo se llama hoy un botón, dilo y descríbelo por su función y su ubicación. No des un nombre aproximado seguido de "o algo parecido": eso suena a que lo comprobaste cuando no lo hiciste.`;
}

/** Full system prompt: persona plus the generated tutorial section. */
export function tutorSystemPrompt(): string {
  return `${TUTOR_PERSONA}\n\n${tutorialInstructions()}`;
}

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

function tutorialToolConfig(): ClientToolConfig {
  return {
    type: 'client',
    name: TUTORIAL_TOOL_NAME,
    description:
      'Muestra en la pantalla de la persona un tutorial ilustrado paso a paso. Llámala al empezar a explicar un procedimiento y otra vez, con el número de paso, cada vez que avances.',
    // The browser answers instantly, and waiting is what lets the agent find out
    // that an id was wrong before it starts narrating a tutorial nobody can see.
    expects_response: true,
    response_timeout_secs: 5,
    parameters: {
      type: 'object',
      properties: {
        tutorial_id: {
          type: 'string',
          description: `Identificador exacto del tutorial. Valores válidos: ${TUTORIALS.map(
            (t) => t.id,
          ).join(', ')}.`,
        },
        paso: {
          type: 'integer',
          description:
            'Número del paso que se está explicando, empezando en 1. Si se omite, se muestra el primero.',
        },
      },
      required: ['tutorial_id'],
    },
  };
}

/**
 * Create or update the tutorial client tool, returning its id.
 *
 * Tools are workspace-level objects keyed by name, and deleting one that an
 * agent still references is refused by the API. So this reconciles by name:
 * update in place if it exists, create otherwise. Provisioning twice is safe
 * and leaves exactly one tool behind.
 */
export async function ensureTutorialTool(): Promise<string> {
  const { tools } = await listTools();
  const existing = tools.find((t) => t.tool_config?.name === TUTORIAL_TOOL_NAME);
  const config = tutorialToolConfig();

  if (existing) {
    await updateTool(existing.id, config);
    return existing.id;
  }
  const created = await createTool(config);
  return created.id;
}

/**
 * Create the tutor agent. Returns the new id, which the caller must persist
 * into the environment — nothing is written back at runtime.
 */
export async function provisionAgent(): Promise<string> {
  const llm = process.env.ELEVENLABS_AGENT_LLM?.trim();
  const voiceId = process.env.ELEVENLABS_VOICE_ID?.trim();
  const toolId = await ensureTutorialTool();

  const config: AgentConfig = {
    name: 'JIT Learning Coach',
    conversation_config: {
      agent: {
        first_message: DEFAULT_FIRST_MESSAGE,
        language: agentLanguage(),
        prompt: {
          prompt: tutorSystemPrompt(),
          // Omitted entirely when unset, so ElevenLabs picks its workspace default.
          ...(llm ? { llm } : {}),
          knowledge_base: [],
          rag: ragConfig(),
          tool_ids: [toolId],
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
  // Re-asserted on every sync, not just at provision: an agent created before
  // the tutorials existed would otherwise keep a prompt that promises a tool it
  // does not have, and quietly narrate steps to a blank screen.
  const toolId = await ensureTutorialTool();

  await updateAgent(id, {
    conversation_config: {
      agent: {
        prompt: {
          prompt: tutorSystemPrompt(),
          ...(llm ? { llm } : {}),
          knowledge_base: entries,
          rag: ragConfig(),
          tool_ids: [toolId],
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
