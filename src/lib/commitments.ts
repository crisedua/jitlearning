/**
 * The one thing the learner said they would do.
 *
 * The persona closes every stretch of conversation on a commitment with three
 * parts — what, by when, and what would count as it having worked — and then
 * asks about it at the start of the next session. That follow-up used to depend
 * on ElevenLabs' free-text summary happening to mention the commitment, which
 * made the product's strongest promise a coin flip. This module turns it into a
 * stored field.
 *
 * ## Why this is not in `memory.ts`
 *
 * Every read and write here fails soft, and specifically: a deployment that has
 * run `session_memory` but not `commitments` must keep working exactly as
 * before. Folding these columns into the summary query would make one missing
 * column (Postgres 42703) cost the learner their session memory too, so the
 * commitment is fetched and written on its own and its absence is never fatal.
 *
 * ## Why extraction lives on the ElevenLabs side
 *
 * `dataCollection()` in `agent.ts` declares the fields; ElevenLabs fills them
 * from the transcript when it analyses the call. That keeps this app free of an
 * LLM client of its own, and it means the extraction runs on the full
 * transcript rather than on the summary of it.
 */
import type { ConversationDetail } from './elevenlabs';
import { serviceConfigured, supabaseAdmin } from './supabase/admin';

/** Postgres "undefined column" — the commitments migration has not run here. */
const UNDEFINED_COLUMN = '42703';

/** Long enough for a sentence, short enough that a runaway stays a sentence. */
const FIELD_CHARS = 300;

export interface Commitment {
  /** The action, in the learner's own terms. */
  action: string;
  /** The deadline as it was said. Never parsed into a date — see the migration. */
  due: string | null;
  /** What would count as it having worked. */
  signal: string | null;
  /** When the session that produced it started. */
  sessionDate: string;
}

/**
 * Pull one field out of the analysis.
 *
 * ElevenLabs returns a per-field object whose `value` is whatever the extractor
 * produced, so a field it found nothing for can arrive as null, as an empty
 * string, or absent — and the extractor is instructed to prefer empty over
 * invention. All three mean the same thing here.
 */
function field(conversation: ConversationDetail, name: string): string | null {
  const raw = conversation.analysis?.data_collection_results?.[name]?.value;
  if (typeof raw !== 'string') return null;
  const trimmed = raw.trim();
  // Guard against an extractor that answers the prompt instead of obeying it.
  if (!trimmed || /^(n\/?a|none|ninguno|ninguna|sin compromiso)$/i.test(trimmed)) return null;
  return trimmed.slice(0, FIELD_CHARS);
}

/**
 * Read the commitment out of a finished conversation and store it on its row.
 *
 * Called from the summary backfill, so it rides the same lazy pass and adds no
 * cron. Returns quietly when there is no commitment, which is the common case:
 * plenty of conversations end without one, and a row with nulls is the correct
 * record of that.
 */
export async function storeCommitment(
  sessionId: string,
  conversation: ConversationDetail,
): Promise<void> {
  if (!serviceConfigured()) return;

  const action = field(conversation, 'commitment');
  if (!action) return;

  const { error } = await supabaseAdmin()
    .from('coach_sessions')
    .update({
      commitment: action,
      commitment_due: field(conversation, 'commitment_due'),
      commitment_signal: field(conversation, 'commitment_signal'),
    })
    .eq('id', sessionId);

  if (error && error.code !== UNDEFINED_COLUMN) {
    console.error('[commitments] could not store:', error.message);
  }
}

/**
 * The commitment still worth asking about, or null.
 *
 * "Still open" is defined as *the most recent session that produced one*, and
 * deliberately nothing cleverer. There is no completion column because nothing
 * could set it honestly — the learner reports back in conversation, out loud,
 * and turning that into a boolean would need us to grade an answer we never
 * see. So this asks rather than asserts, and stops mattering once a newer
 * session replaces it.
 */
export async function openCommitment(userId: string): Promise<Commitment | null> {
  if (!serviceConfigured()) return null;

  const { data, error } = await supabaseAdmin()
    .from('coach_sessions')
    .select('commitment, commitment_due, commitment_signal, started_at')
    .eq('user_id', userId)
    .not('commitment', 'is', null)
    .order('started_at', { ascending: false })
    .limit(1)
    .maybeSingle();

  if (error) {
    // Before the migration there is simply no commitment to show, which is a
    // fact about this deployment rather than an error worth logging loudly.
    if (error.code !== UNDEFINED_COLUMN) {
      console.error('[commitments] could not read:', error.message);
    }
    return null;
  }
  if (!data?.commitment) return null;

  return {
    action: data.commitment,
    due: data.commitment_due ?? null,
    signal: data.commitment_signal ?? null,
    sessionDate: new Date(data.started_at).toLocaleDateString('es-ES', {
      day: 'numeric',
      month: 'long',
    }),
  };
}

/**
 * The commitment as a line for the agent's opening context.
 *
 * Stated as fact and left there. What to *do* with it — ask early, find out
 * what blocked it before proposing anything new, don't recite it — is in the
 * persona's "Continuidad entre sesiones", next to every other behaviour rule.
 */
export function commitmentContext(commitment: Commitment): string {
  const parts = [`Compromiso de la sesión del ${commitment.sessionDate}: ${commitment.action}`];
  if (commitment.due) parts.push(`Plazo acordado: ${commitment.due}`);
  if (commitment.signal) parts.push(`Señal de que salió bien: ${commitment.signal}`);
  return parts.join('. ') + '.';
}
