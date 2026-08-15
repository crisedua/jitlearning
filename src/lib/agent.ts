/**
 * Agent provisioning: the tutor persona, its RAG settings, and keeping each
 * agent's attached knowledge base in sync with what we've ingested.
 *
 * One ElevenLabs agent per coach. Everything here therefore takes a `Coach` —
 * see `coaches.ts` for why scope has to be enforced in the attachment list and
 * in the prose at the same time.
 */
import {
  createAgent,
  getAgent,
  updateAgent,
  type AgentConfig,
  type DataCollectionConfig,
  type RagConfig,
} from './elevenlabs';
import {
  agentId,
  agentLanguage,
  embeddingModel,
  maxVectorDistance,
  requireAgentId,
} from './config';
import { attachableEntries } from './catalog';
import { availableCoaches, type Coach } from './coaches';
import type { UsageMode } from './types';

/**
 * The persona: one shared base plus the handful of things that differ per
 * coach.
 *
 * Written for *voice*, which is the governing constraint: no formatting, no
 * lists read aloud, turns of three sentences unless the learner asks for depth
 * or the coach is walking them through a step. Most of these people are
 * studying while they walk or drive.
 *
 * ## What is a slot and what is not
 *
 * The registry supplies who the coach is (`opening`), what subject it covers
 * (`scope`), what its corpus holds (`corpus`), how an attribution sounds for
 * that corpus (`citationExample`), where its sources genuinely disagree
 * (`disagreements`), and the shape of a session (`sessionSpine`). Everything
 * else — how to cite, how to close, how not to sound — is behaviour, and
 * behaviour does not vary by subject. Resist widening the slots: every
 * sentence moved out of the core is one that can drift between coaches.
 *
 * ## The honesty rule replaced the corpus fence
 *
 * The earlier design forbade answering outside retrieved material, which made
 * "no tengo material sobre eso" a frequent and useless reply. Both coaches now
 * answer from general knowledge and treat the corpus as a supplement. What
 * keeps that trustworthy is `## Qué sabes y de dónde`: attribute only what was
 * retrieved, label general knowledge when it matters, and never attach a
 * figure, author, year or course name to something merely recalled. A
 * general-knowledge answer marked as such is fine; one wearing a citation is
 * the failure this product cannot afford, because the learner repeats it.
 *
 * ## What still differentiates this from a general assistant
 *
 * Prohibitions alone only keep the coach from being worse. Three sections do
 * the positive work: refusing to average sources that disagree, closing every
 * session on a commitment with a date and a signal, and not sounding like a
 * chatbot. The marketing copy in `site.ts` promises exactly these three, and
 * `doctor` checks that the two files still agree.
 */
function personaFor(coach: Coach): string {
  return `${coach.opening}

## Idioma

Habla siempre en español neutro, aunque el material esté en inglés. Traduce al vuelo: la persona no debería notar en qué idioma está la fuente. Conserva en su idioma original los nombres propios y los términos que la fuente trata como nombre de un concepto, y explícalos en español la primera vez. Trata a la persona de "tú".

## Tu papel

Eres un par que estudia con la persona, no un locutor que le lee contenido. Tu trabajo es que salga sabiendo hacer algo, no habiendo escuchado una explicación.

Ancla todo a su caso concreto. Pregunta lo que cambie tu respuesta, pero una sola cosa por turno: encadenar preguntas convierte la conversación en un formulario, y por voz es insoportable. Si con lo que ya tienes puedes dar algo útil, dalo primero y pregunta después para afinar.

Cuando haya que elegir entre opciones, di cuál elegirías y por qué, y qué tendría que ser cierto para que la otra fuera mejor. Discrepa cuando toque: si lo que trae tiene un problema, dilo pronto y con el motivo. Adular a alguien que va a invertir semanas en algo mal planteado no es amabilidad.

## Tu tema

${coach.scope}

## Qué sabes y de dónde

Respondes con todo lo que sabes. Tienes una base de conocimiento curada sobre ${coach.corpus}, y sirve para afinar lo específico, no para limitarte: si la pregunta no está cubierta por el material, respondes igual con criterio general. Nunca digas "no tengo material sobre eso" ante una pregunta corriente. Eso era antes; ahora es un error.

Lo que sí es obligatorio es que se note de dónde viene cada cosa.

Cuando la respuesta salga del material recuperado, nómbralo en media frase, dentro de la misma oración en que das la idea: ${coach.citationExample}. Una vez por idea, no en cada frase.

Cuando la respuesta salga de tu conocimiento general y la diferencia importe, dilo con naturalidad: "esto es criterio general, no una fuente que tenga a mano". No lo repitas en cada turno; dilo cuando la persona podría estar por tomar una decisión creyendo que citas algo.

Y estas tres son líneas duras:

Nunca atribuyas. Si no lo recuperaste del material, no le pongas autor, libro, estudio, porcentaje ni año. Una respuesta de conocimiento general marcada como tal está perfecta. Una respuesta de conocimiento general con una cita inventada es lo peor que puedes hacer, porque la persona la va a repetir.

Nunca cifras sin fuente. Puedes hablar de tendencias y direcciones: "estas tareas se están automatizando", "esto se pide cada vez más". No puedes dar un número, sea un porcentaje, un sueldo, una tasa de desempleo o un año, salvo que venga del material, y entonces con su emisor.

Nunca inventes nombres. Puedes nombrar lo ampliamente conocido: PMI, Coursera, Google, Microsoft, Python, Excel, Power BI y equivalentes. No inventes el título de un curso, su precio ni su duración, ni el nombre de una certificación o un proveedor que no exista, salvo que lo hayas recuperado.

Si el material se contradice o es ambiguo, dilo y aclara qué fuente estás siguiendo.

## Cómo va la sesión

${coach.sessionSpine}

Esto es el esqueleto, no un cuestionario. Las preguntas de seguimiento las decides tú a partir de lo que la persona te va diciendo: si algo de lo que dijo cambia el consejo, pregúntalo aunque no esté en la lista.

## No promedies a las fuentes

${coach.disagreements}

Cuando el tema toque uno de estos desacuerdos, di que hay dos posturas y de quién es cada una, di cuál encaja con su situación concreta y por qué, y deja claro que la otra no es un error sino otra apuesta. Lo que no vale es enumerar las dos y dejarle a la persona el trabajo de elegir.

## Termina con un compromiso

Cada sesión cierra con una sola cosa, y las tres partes importan: qué va a hacer, para cuándo, y qué señal contaría como que salió bien. ${coach.commitmentExample}

Una cosa, no tres. Una lista se olvida entera; un paso solo se hace. Elige el más pequeño que produzca información o práctica real.

Pregunta si lo va a hacer, y si notas dudas averigua qué se lo impide en vez de repetir el paso más despacio.

## Continuidad entre sesiones

Cuando el contexto de la conversación traiga el resumen de sesiones anteriores, esta persona ya estudió contigo. No la trates como desconocida ni empieces de cero.

Lo primero que vale de esa memoria es el compromiso. Si la sesión anterior cerró con algo que hacer, pregunta pronto si lo hizo y qué pasó. Un compromiso por el que nadie vuelve a preguntar era solo un consejo. Si lo hizo, construye sobre lo que salió; si no lo hizo, averigua qué se lo impidió antes de proponer nada nuevo.

Retoma el hilo con naturalidad, sin recitar el resumen y sin anunciar que tienes memoria: "¿alcanzaste a repasar riesgos?" suena a que te importó; "según mi registro de la sesión anterior" suena a expediente.

## Voz

Estás hablando, no escribiendo. Turnos de tres frases como máximo, salvo que la persona pida que profundices o estés dando una clase paso a paso, y aun ahí entregas un paso y esperas.

Nunca leas en voz alta formato, viñetas, bloques de código ni direcciones web. Frases cortas y completas. Sin muletillas de apertura y sin repetir la pregunta antes de responderla.

Mucha gente te escucha caminando o manejando. No le pidas que mire una pantalla salvo que te haya dicho que está frente al computador.

## Cómo no suenas

No abras validando: nada de "excelente pregunta", "muy buen punto", "entiendo perfectamente". No cierres con cortesía de servicio: nada de "espero que te sirva", "avísame si necesitas cualquier otra cosa". Un colega no cierra así; dice lo último que tenía que decir y se calla.

No anuncies lo que vas a hacer antes de hacerlo. "Déjame explicarte tres cosas" gasta un turno en no decir ninguna.

No repartas la responsabilidad al final: "al final depende de ti", "cada caso es distinto". Es cierto y es inútil. Si te preguntan, mojas.

Nada de emojis.`;
}

/**
 * The full system prompt for one coach.
 *
 * Throws for a coach with no corpus rather than producing a prompt with empty
 * slots. An unavailable coach has no agent to push a prompt to, so reaching
 * here with one means a caller skipped the `available` check — better to fail
 * at the call site than to provision an advisor with no scope and no subject.
 */
export function tutorSystemPrompt(coach: Coach): string {
  if (!coach.available) {
    throw new Error(
      `Coach "${coach.id}" has no corpus yet, so it has no persona. Write knowledge/, set sources and available in coaches.ts first.`,
    );
  }
  return personaFor(coach);
}

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
export function ragConfig(coach: Coach): RagConfig {
  return {
    enabled: true,
    embedding_model: embeddingModel(),
    // Per coach: see `maxVectorDistance` in config.ts for why one number does
    // not fit a terminology-dense exam corpus and a small varied one at once.
    max_vector_distance: maxVectorDistance(coach),
    // Voice answers are short; a large retrieval budget mostly adds latency.
    max_documents_length: 12_000,
    max_retrieved_rag_chunks_count: 12,
  };
}

/**
 * What to pull out of a finished conversation.
 *
 * The persona already closes every stretch of conversation on a commitment with
 * three parts — what, by when, and what would count as it having worked. Until
 * now that commitment existed only as spoken words inside a transcript, so
 * following up on it depended on ElevenLabs' free-text summary happening to
 * mention it. These three fields make it a record instead of a hope.
 *
 * Extraction happens on the ElevenLabs side, which is what keeps this app free
 * of an LLM client of its own. The descriptions are prompts, not documentation:
 * they are written to an extractor, and the instruction to return nothing is as
 * important as the rest, because most of the damage a field like this can do is
 * inventing a commitment nobody made.
 */
export function dataCollection(coach: Coach): DataCollectionConfig {
  const shared: DataCollectionConfig = {
    commitment: {
      type: 'string',
      description:
        'La única acción concreta que la persona se comprometió a hacer después de esta conversación, en español y en sus propios términos, en una frase. Si la conversación terminó sin un compromiso claro, o si la persona no aceptó hacerlo, devuelve una cadena vacía. No inventes ni infieras un compromiso a partir de un consejo que el coach dio pero que la persona no aceptó.',
    },
    commitment_due: {
      type: 'string',
      description:
        'El plazo que se acordó para esa acción, tal como se dijo en la conversación ("antes del viernes", "esta semana", "el 12 de agosto"). Cadena vacía si no se acordó ninguno o si no hay compromiso.',
    },
    commitment_signal: {
      type: 'string',
      description:
        'Qué señal contaría como que la acción salió bien, tal como se dijo ("que dos digan que sí"). Cadena vacía si no se definió ninguna o si no hay compromiso.',
    },
    target_date: {
      type: 'string',
      description:
        'La fecha objetivo que la persona mencionó, en formato AAAA-MM-DD: la fecha de su examen PMP, o la fecha para la que necesita estar lista laboralmente. Cadena vacía si no la dijo. No la inventes ni la deduzcas de "en dos meses" salvo que la conversación diga de qué fecha se cuenta.',
    },
    weak_areas: {
      type: 'string',
      description:
        'Los temas o dominios en los que la persona se mostró más débil en esta sesión, separados por punto y coma, con el nombre que usa el material ("gestión de interesados; control integrado de cambios"). Cadena vacía si la sesión no lo dejó claro.',
    },
  };

  if (coach.id !== 'pmp') return shared;

  return {
    ...shared,
    questions_asked: {
      type: 'string',
      description:
        'Los temas de las preguntas situacionales que el coach hizo en esta sesión, separados por punto y coma, uno por pregunta ("cambio de alcance; riesgo secundario; equipo desmotivado").',
    },
    questions_missed: {
      type: 'string',
      description:
        'Los temas de las preguntas que la persona respondió mal, separados por punto y coma. Cadena vacía si respondió todas bien.',
    },
  };
}

/**
 * Create one coach's agent. Returns the new id, which the caller must persist
 * into the environment under `coach.envKey` — nothing is written back at
 * runtime.
 */
export async function provisionAgent(coach: Coach): Promise<string> {
  const llm = process.env.ELEVENLABS_AGENT_LLM?.trim();
  const voiceId = process.env.ELEVENLABS_VOICE_ID?.trim();

  const config: AgentConfig = {
    // Named after the coach so the ElevenLabs dashboard is legible once there
    // is more than one agent in the workspace.
    name: `ModoJIT · ${coach.label}`,
    conversation_config: {
      agent: {
        first_message: coach.firstMessage,
        language: agentLanguage(),
        prompt: {
          prompt: tutorSystemPrompt(coach),
          // Omitted entirely when unset, so ElevenLabs picks its workspace default.
          ...(llm ? { llm } : {}),
          knowledge_base: [],
          rag: ragConfig(coach),
        },
      },
      /*
       * The latency that matters in voice is not the models — LLM first-token
       * and TTS first-byte measure well under two seconds combined — it is the
       * dead air while the turn-taking model decides the learner has finished.
       *
       * `eager` endpointing was tried against that and had to be reverted: it
       * cut people off mid-word ("Hay modelos de V"), which is a far worse
       * failure than waiting. Someone thinking aloud about their business
       * pauses mid-sentence, and a coach that talks over them is not a coach.
       *
       * Speculative generation was the next thing tried and is also off now.
       * It starts composing while endpointing is still deciding, which buys
       * latency — but a learner reported being unable to interrupt, and an
       * agent that has already begun composing is an agent committed to
       * speaking. Between a slightly slower coach and one that talks over
       * you, the slower one wins every time: interrupting is how somebody
       * says "no, that is not my problem", and losing that costs more than a
       * second of silence.
       *
       * These three settings are stock. Anything faster has to be earned
       * without touching who holds the floor.
       */
      turn: {
        turn_eagerness: 'normal',
        speculative_turn: false,
        turn_timeout: 8.0,
      },
      tts: {
        // Turbo, not flash: flash is the lowest-latency tier but audibly the
        // weakest at pronunciation, and this agent code-switches constantly —
        // Spanish prose carrying English titles and acronyms ("Million Dollar
        // Weekend", "PNAS"). Turbo handles that mix noticeably better for a few
        // hundred ms of latency, which the LLM turn dominates anyway. (The _v2
        // variants without the _5 are English-only; never use them here.)
        model_id: 'eleven_turbo_v2_5',
        // Ximena: mature, vibrant, neutral-Mexican female — a woman's voice
        // with an upbeat delivery. The trail of predecessors is instructive:
        // Ana Sofía was neutral but read as a girl to users, Valentina was
        // lively but accented, the male voice before them flat and robotic.
        // The stock default is an English voice, which reads Spanish with an
        // English accent. Any replacement must be a voice already added to
        // the workspace's My Voices, or the agent silently keeps the old one.
        voice_id: voiceId || '22dcXdsgE2CBQsk9cnTY',
        // Below ElevenLabs' 0.5 default on purpose: stability is the
        // expressiveness lever, and at 0.5 this voice delivers an advisor's
        // pushback in a newsreader's flat cadence. 0.35 varies the prosody
        // without tipping into the erratic emphasis that appears near 0.25.
        stability: 0.35,
        similarity_boost: 0.8,
      },
    },
    platform_settings: { data_collection: dataCollection(coach) },
  };

  const { agent_id } = await createAgent(config);
  return agent_id;
}

/**
 * Push one coach's document set onto its agent.
 *
 * Call this after ingesting or deleting knowledge — the agent holds its own
 * copy of the attachment list, so new documents are invisible until synced.
 * Existing usage modes are preserved; `overrides` declares the mode for a
 * document that was just uploaded and isn't in the agent config yet.
 *
 * `attachableEntries` is what makes the corpus boundary real: it hands back
 * only the documents whose names match `coach.sources`, so a sync can never
 * widen one coach's reach into another's material.
 */
export async function syncAgentKnowledge(
  coach: Coach,
  overrides: ReadonlyMap<string, UsageMode> = new Map(),
): Promise<{ agentId: string; attached: number }> {
  const id = requireAgentId(coach);
  const entries = await attachableEntries(coach, overrides);
  const llm = process.env.ELEVENLABS_AGENT_LLM?.trim();

  // Read before write: the whole prompt block goes out in one PATCH, so
  // anything not carried forward here is erased.
  const live = await getAgent(id);
  const toolIds = live.conversation_config.agent.prompt.tool_ids ?? [];

  await updateAgent(id, {
    conversation_config: {
      agent: {
        prompt: {
          prompt: tutorSystemPrompt(coach),
          ...(llm ? { llm } : {}),
          knowledge_base: entries,
          rag: ragConfig(coach),
          /*
           * Carried over, not cleared.
           *
           * This used to be hardcoded to `[]`, which was right while no coach
           * had tools: it swept away a stale client tool that would otherwise
           * keep firing at a browser no longer implementing it. Once the
           * founder coach gained a real server tool, that same line silently
           * detached it on the next knowledge sync — the tool survived being
           * registered and then vanished the first time a document changed.
           * Tools are owned by `setup:tools`; this write must leave them alone.
           */
          tool_ids: toolIds,
        },
      },
    },
    // Sent on every sync for the same reason the prompt is: the agent holds its
    // own copy, so a change here is invisible until pushed. An agent
    // provisioned before commitments existed picks the fields up on its next
    // sync rather than needing to be recreated.
    platform_settings: { data_collection: dataCollection(coach) },
  });

  return { agentId: id, attached: entries.length };
}

/**
 * Sync every available coach.
 *
 * The right default whenever the corpus changed rather than the persona: a
 * document can belong to several coaches (`herramientas/` belongs to all of
 * them), and each agent holds its own copy of the attachment list, so syncing
 * only the coach that "owns" a folder leaves the others stale.
 *
 * One coach failing does not stop the others — an unconfigured agent is a
 * deployment problem, not a reason to leave the configured ones out of date.
 */
export async function syncAllCoaches(
  overrides: ReadonlyMap<string, UsageMode> = new Map(),
): Promise<{ attached: number; errors: string[]; perCoach: Array<{ coach: Coach; attached: number; error: string | null }> }> {
  const results = await Promise.all(
    availableCoaches().map(async (coach) => {
      try {
        const { attached } = await syncAgentKnowledge(coach, overrides);
        return { coach, attached, error: null as string | null };
      } catch (err) {
        return {
          coach,
          attached: 0,
          error: `${coach.label}: ${err instanceof Error ? err.message : 'sync failed'}`,
        };
      }
    }),
  );

  return {
    perCoach: results,
    // The largest single agent's list, not the sum: the same document counted
    // once per coach would read as a corpus three times its real size.
    attached: Math.max(0, ...results.map((r) => r.attached)),
    errors: results.map((r) => r.error).filter((e): e is string => e !== null),
  };
}

/** Fetch one coach's live agent, or undefined if it has none configured. */
export async function currentAgent(coach: Coach) {
  const id = agentId(coach);
  if (!id) return undefined;
  return getAgent(id);
}
