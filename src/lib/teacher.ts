/**
 * The teacher: one product, one agent, one corpus.
 *
 * This replaced a registry of coaches. The multi-coach shape was real
 * complexity, all of it in service of a question ("which subject?") that the
 * product no longer asks: there is one voice teacher, it teaches working with
 * AI, and every learner meets the same one. What survived from the old design
 * is the part that was never about choice.
 *
 * ## The corpus is a supplement, not a fence
 *
 * `sources` still exists, and still matters, but not as a boundary on what the
 * teacher may answer. The teacher answers from general knowledge; the attached
 * documents sharpen specifics when they happen to be relevant. What `sources`
 * does now is keep the retired corpora out: three subjects this product no
 * longer teaches still sit on disk under `knowledge/_retired/`, and a document
 * outside `empleabilidad/` must not reach the agent, or a learner eventually
 * gets a confident answer about a subject nobody is maintaining.
 *
 * Attachment remains physical: a chunk that is not in the agent's attachment
 * list cannot be retrieved, whatever the prose says.
 */

export const TEACHER = {
  /** Used in the agent's name at ElevenLabs and nowhere a learner sees. */
  id: 'profesor-ia',
  label: 'Profesor de IA',
  /** The env var holding the agent id. One agent, so one variable. */
  envKey: 'ELEVENLABS_AGENT_ID',
  /** Document-name prefixes the agent may carry. See the note above. */
  sources: ['empleabilidad/'] as readonly string[],
  /**
   * Noun phrase for the corpus, dropped into the persona's honesty section. Kept
   * vague about volume on purpose: it is a supplement, and a persona told it has
   * "a knowledge base" behaves as though the answer should be in there.
   */
  corpus:
    'guías sobre cómo sacarle resultados a los asistentes de IA y cómo elegir entre ellos, más el material que se vaya sumando',
  /**
   * How an attribution sounds. This is an instruction, not documentation: the
   * example has to name something the corpus actually contains, or it teaches
   * the model to invent a plausible-sounding source.
   */
  citationExample:
    '"esto viene de la guía de skills de Claude que tengo en el material" o "esto lo dice la comparativa entre asistentes que tengo acá"',
  /**
   * The distinctive words in `citationExample`, as they appear in the filenames
   * of the documents it refers to.
   *
   * The comment above states an invariant that nothing enforced: the example has
   * to name a document the corpus actually holds. It does today — "skills de
   * Claude" is `empleabilidad/skills-de-claude.md` and "la comparativa entre
   * asistentes" is `empleabilidad/comparativa-chatgpt-claude-gemini.md` — and
   * retiring either one would leave the persona teaching the model to cite a
   * source that is not there.
   *
   * That failure is invisible and lands on the one promise this product cannot
   * afford to break. The landing page's fourth claim is "No inventa", and a
   * teacher confidently attributing an answer to a document nobody attached is
   * precisely inventing. `npm run doctor` checks these against the live agent's
   * attachment list.
   */
  citationTokens: ['skills', 'comparativa'] as const,
  /**
   * Retrieval strictness. 0.8 rather than tighter: answers here lean mostly on
   * general knowledge over a small, varied corpus, and a tight gate returns
   * nothing at all, which makes the supplement decorative. Overridable with
   * `ELEVENLABS_MAX_VECTOR_DISTANCE` without a deploy.
   */
  maxVectorDistance: 0.8,
} as const;

/**
 * The first thing said out loud, injected as the `apertura` dynamic variable.
 *
 * Two versions because the two sessions are different products. A first session
 * opens on a question about the learner; a later one opens on what they owe from
 * last time, which is composed from the record rather than left to the model to
 * remember to do.
 */
export const OPENING_FIRST =
  '¿Empezamos? Cuéntame a qué te dedicas hoy, o qué estudias, y desde ahí armamos tu plan.';

export const OPENING_RETURN_FALLBACK = 'Retomemos donde quedamos. ¿Cómo te fue con lo que quedaste?';

/** Whether a document belongs to the teacher's corpus. Prefix match on the name. */
export function ownsDocument(documentName: string): boolean {
  return TEACHER.sources.some((prefix) =>
    prefix.endsWith('/') ? documentName.startsWith(prefix) : documentName === prefix,
  );
}
