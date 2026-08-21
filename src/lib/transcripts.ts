/**
 * What was said in a class, kept so the learner can read it back.
 *
 * The product records what a class *produced* — the task, the commitment, the
 * two numbers — and until now threw away what it *was*. The words lived on the
 * ElevenLabs side, where `classes.ts` could fetch them and only `/admin/embudo`
 * ever did, so a learner who wanted to re-read what their teacher told them had
 * nowhere to go. Somebody asked where their conversations had been saved, and
 * the honest answer was that they had not been.
 *
 * ## What is kept, and what is dropped
 *
 * A post-call turn arrives with about thirty fields: tool calls, token counts,
 * latency metrics, model names, guardrail flags, RAG retrieval traces. Three of
 * them are the conversation. The rest is an operational log, and storing it
 * under a learner's name would make this row something other than what they
 * were promised — while multiplying its size by an order of magnitude for
 * nobody's benefit.
 *
 * So `trimTurns` is the whole policy: role, message, timestamp, and only for
 * turns that actually said something.
 */
import { supabaseAdmin, serviceConfigured } from './supabase/admin';

/** One line of a class, as the learner reads it back. */
export interface TranscriptTurn {
  /** Who spoke. Anything the platform does not call `user` is the teacher. */
  role: 'user' | 'agent';
  message: string;
  /** Seconds from the start of the call, so the reader can follow the shape. */
  at: number;
}

/**
 * A ceiling per turn, so one runaway message cannot make a row unreadable.
 *
 * Well past any spoken turn: a person talking for a full ten-minute class
 * without pausing lands nowhere near this. It exists for the case where a
 * malformed payload puts something enormous in `message`, not to truncate
 * anybody's actual sentence.
 */
const MAX_TURN_CHARS = 8_000;

/**
 * A ceiling on turns, for the same reason at the other scale.
 *
 * A ten-minute class runs to a few dozen turns; the longest real one in this
 * deployment is 47. Two thousand is far enough above that to never touch a real
 * class and low enough that a loop on the sending side cannot write a row that
 * has to be read back into a page.
 */
const MAX_TURNS = 2_000;

/**
 * Turns the platform's payload into the three fields worth keeping.
 *
 * Defensive about shape on purpose: this is fed straight from a third party's
 * webhook body, and the failure that matters is not a crash — the route already
 * catches those — but a class silently stored as an empty array because one
 * field was renamed. Anything unrecognisable is dropped, and what survives is
 * always the same shape.
 *
 * Empty messages are dropped because ElevenLabs emits them: a real class opens
 * with two agent turns at 0s carrying no text, which would render as two blank
 * bubbles above the first thing anybody said.
 */
export function trimTurns(raw: unknown): TranscriptTurn[] {
  if (!Array.isArray(raw)) return [];

  const turns: TranscriptTurn[] = [];
  for (const entry of raw) {
    if (turns.length >= MAX_TURNS) break;
    if (!entry || typeof entry !== 'object') continue;

    const row = entry as Record<string, unknown>;
    const message = typeof row.message === 'string' ? row.message.trim() : '';
    if (!message) continue;

    /*
     * Either name, because this function reads two different shapes.
     *
     * The webhook sends `time_in_call_secs`; a row read back out of the table
     * holds the `at` this function wrote. `readTranscript` runs stored turns
     * through here again so the page can never render a shape the type does not
     * describe — and reading only the platform's name would have silently
     * zeroed every timestamp on the way back out, turning a class into a wall
     * of turns that all happened at second zero.
     */
    const at = Number(row.time_in_call_secs ?? row.at);

    turns.push({
      role: row.role === 'user' ? 'user' : 'agent',
      message: message.slice(0, MAX_TURN_CHARS),
      // A missing or unparseable timestamp becomes 0 rather than NaN, which
      // would serialise into the row as null and read back as a broken clock.
      at: Number.isFinite(at) && at > 0 ? Math.round(at) : 0,
    });
  }

  return turns;
}

/**
 * Stores one class, keyed on the conversation so a redelivery updates it.
 *
 * Never throws and never blocks the caller: this runs inside the post-call
 * webhook, next to the write that produces the learner's map and plan. A
 * transcript that fails to store is a class somebody cannot re-read, which is
 * worth logging; a transcript that fails *loudly* would take the summary down
 * with it, which is worth a great deal more.
 */
export async function saveTranscript(
  userId: string,
  conversationId: string,
  raw: unknown,
): Promise<number> {
  if (!serviceConfigured()) return 0;

  const turns = trimTurns(raw);
  if (turns.length === 0) return 0;

  const { error } = await supabaseAdmin()
    .from('session_transcripts')
    .upsert({ user_id: userId, conversation_id: conversationId, turns }, {
      onConflict: 'conversation_id',
    });

  if (error) {
    console.error('[transcripts] could not store class:', error.message);
    return 0;
  }
  return turns.length;
}

/**
 * One class, for the learner who owns it.
 *
 * Scoped by `user_id` in the query as well as by the table's policy. The policy
 * is what actually protects the row, and this is the belt beside it: the read
 * runs under the service role, which bypasses row-level security entirely, so
 * the filter here is not redundant — it is the only thing standing between one
 * learner's id in a URL and another learner's class.
 */
export async function readTranscript(
  userId: string,
  conversationId: string,
): Promise<TranscriptTurn[] | null> {
  if (!serviceConfigured()) return null;

  const { data, error } = await supabaseAdmin()
    .from('session_transcripts')
    .select('turns')
    .eq('conversation_id', conversationId)
    .eq('user_id', userId)
    .maybeSingle();

  if (error || !data) return null;
  return trimTurns((data as { turns: unknown }).turns);
}
