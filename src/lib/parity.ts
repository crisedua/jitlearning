/**
 * What the live agent carries, against what this repo says it should.
 *
 * Everything here fails the same way: silently, after somebody edits the agent
 * in the ElevenLabs dashboard, with every other check still green. That is the
 * whole reason these exist, and it is also why the answer must be computed in
 * one place. Two copies of "is the agent right" is two definitions of right.
 *
 * `npm run doctor` and `/admin/estado` both ask this, in English and in Spanish,
 * and each had grown its own arithmetic for it. The comparison lives here; the
 * sentences stay with each audience.
 */
import {
  dataCollection,
  dynamicVariablePlaceholders,
  evaluationCriteria,
  ragConfig,
  teacherSystemPrompt,
} from './agent';

/** The shape of the parts of an agent this cares about. */
export interface LiveAgent {
  prompt?: {
    prompt?: string;
    tool_ids?: string[];
    rag?: { enabled?: boolean; embedding_model?: string; max_vector_distance?: number };
  };
  /*
   * A sibling of `prompt` on the agent, not a child of it. Reading it from
   * inside `prompt` returns undefined, which reads as "no placeholders declared"
   * and would have both surfaces reporting that every conversation fails
   * outright, on an agent where all three are present. Found by running this
   * against the live agent instead of trusting the shape.
   */
  dynamicVariables?: Record<string, unknown>;
  platform_settings?: {
    data_collection?: Record<string, unknown>;
    evaluation?: { criteria?: Array<{ id?: string }> };
  };
}

export type PersonaState =
  /** The live prompt is the variant this agent's tools call for. */
  | 'match'
  /** A search tool is attached and the prompt says it cannot look anything up. */
  | 'under-promises'
  /** No tool is attached and the prompt promises a search. */
  | 'over-promises'
  /** Neither variant. Somebody edited it, or the sync never ran. */
  | 'foreign'
  /** No prompt at all. */
  | 'empty';

export interface Parity {
  hasTool: boolean;
  persona: PersonaState;
  /** Declared in the repo and absent from the agent. */
  missingVariables: string[];
  missingFields: string[];
  missingCriteria: string[];
  /** Empty when retrieval matches; otherwise what differs, in repo terms. */
  retrieval: { enabled: boolean; drift: string[] };
}

export function parity(agent: LiveAgent): Parity {
  const prompt = agent.prompt;
  const hasTool = (prompt?.tool_ids ?? []).length > 0;
  const live = (prompt?.prompt ?? '').trim();

  /*
   * Which variant is right is decided by the agent, not by preference. Both
   * mismatches are named, because the fix reads differently depending on the
   * direction, and the quiet one — a tool attached and a prompt that declines to
   * use it — errors nowhere and is taught to everybody.
   */
  const persona: PersonaState = !live
    ? 'empty'
    : live === teacherSystemPrompt({ search: hasTool }).trim()
      ? 'match'
      : live === teacherSystemPrompt({ search: !hasTool }).trim()
        ? hasTool
          ? 'under-promises'
          : 'over-promises'
        : 'foreign';

  const declaredVars = Object.keys(agent.dynamicVariables ?? {});
  const liveFields = Object.keys(agent.platform_settings?.data_collection ?? {});
  const liveCriteria = (agent.platform_settings?.evaluation?.criteria ?? []).map((c) => c.id);

  const want = ragConfig();
  const rag = prompt?.rag;
  const drift: string[] = [];
  if (rag?.embedding_model !== want.embedding_model) {
    drift.push(`embedding model ${rag?.embedding_model ?? 'unset'}, repo says ${want.embedding_model}`);
  }
  if (rag?.max_vector_distance !== want.max_vector_distance) {
    drift.push(`relevance gate ${rag?.max_vector_distance ?? 'unset'}, repo says ${want.max_vector_distance}`);
  }

  return {
    hasTool,
    persona,
    missingVariables: Object.keys(dynamicVariablePlaceholders()).filter(
      (v) => !declaredVars.includes(v),
    ),
    missingFields: Object.keys(dataCollection()).filter((f) => !liveFields.includes(f)),
    missingCriteria: evaluationCriteria()
      .map((c) => c.id)
      .filter((id) => !liveCriteria.includes(id)),
    retrieval: { enabled: Boolean(rag?.enabled), drift },
  };
}
