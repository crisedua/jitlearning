/**
 * Cross-session memory: what lets a learner log out, come back tomorrow, and
 * have the coach pick up the thread instead of starting cold.
 *
 * There is no summarising step of our own. ElevenLabs writes an automatic
 * summary of every finished conversation; this module caches those summaries
 * onto the learner's `coach_sessions` rows and replays the recent ones as
 * conversation context when the next session starts.
 *
 * The backfill is lazy on purpose — it runs when a signed URL is minted, not
 * on a schedule. By the time someone returns for a new session, the summary of
 * their last one has long been ready, and the app keeps needing no cron.
 *
 * Everything here is best-effort. Without the service role there is no session
 * ledger at all, so `null` (a cold start) is the only honest answer. Before
 * the `session_memory` migration has run, the ledger exists but has nowhere to
 * cache summaries — then they are fetched from ElevenLabs live on every start,
 * so memory works from the first deploy and the migration only makes it cheap
 * and durable.
 */
import { ElevenLabsError, getConversation } from './elevenlabs';
import { mapWithConcurrency } from './config';
import { commitmentContext, openCommitment, storeCommitment } from './commitments';
import { serviceConfigured, supabaseAdmin } from './supabase/admin';

/** Rows considered per start. Only the newest of them are ever replayed. */
const RECENT_ROWS = 5;
/** Summaries actually sent to the agent. More is latency and noise, not memory. */
const CONTEXT_SESSIONS = 3;
/**
 * Summary fetches per start when the cache is available. Bounds what the
 * backfill can add to the time between "Hablar con el coach" and the first
 * word — anything left unfetched is picked up on a later start.
 */
const BACKFILL_LIMIT = 2;
/** Per-summary cap. ElevenLabs writes a paragraph; a runaway one stays a paragraph. */
const SUMMARY_CHARS = 900;

interface SessionRow {
  id: string;
  conversation_id: string;
  started_at: string;
  summary: string | null;
  summary_synced_at: string | null;
  user_id?: string | null;
}

function sessionDate(iso: string): string {
  return new Date(iso).toLocaleDateString('es-ES', {
    day: 'numeric',
    month: 'long',
    year: 'numeric',
  });
}

/**
 * Fetch the summary for one session row, persisting it when the schema can
 * hold it. Returns the summary text, or null when there is nothing (yet) to
 * remember.
 *
 * The row is stamped `summary_synced_at` only on a definitive outcome — a
 * processed call, or a conversation ElevenLabs no longer has — so a call still
 * being analysed is simply retried on the next start.
 */
async function backfillRow(row: SessionRow, persist: boolean): Promise<string | null> {
  let summary: string | null = null;
  let title: string | null = null;

  try {
    const conversation = await getConversation(row.conversation_id);
    if (conversation.status !== 'done') return null;
    summary = conversation.analysis?.transcript_summary?.trim() || null;
    title = conversation.analysis?.call_summary_title?.trim() || null;

    // Same fetch, same pass, and on its own write so a deployment missing one
    // migration still gets everything the others can give it.
    if (persist) await storeCommitment(row.id, conversation);
  } catch (err) {
    // Gone from ElevenLabs (retention, manual deletion): stamp it so the
    // backfill stops asking. Anything else — network, auth — retries later.
    if (!(err instanceof ElevenLabsError && err.status === 404)) return null;
  }

  if (persist) {
    const { error } = await supabaseAdmin()
      .from('coach_sessions')
      .update({
        summary,
        summary_title: title,
        summary_synced_at: new Date().toISOString(),
      })
      .eq('id', row.id);
    if (error) console.error('[memory] could not store summary:', error.message);
  }

  return summary;
}

/** The learner's recent sessions, and whether the summary columns exist yet. */
async function recentSessions(
  userId: string,
): Promise<{ rows: SessionRow[]; cached: boolean } | null> {
  const admin = supabaseAdmin();

  const { data, error } = await admin
    .from('coach_sessions')
    .select('id, user_id, conversation_id, started_at, summary, summary_synced_at')
    .eq('user_id', userId)
    .not('conversation_id', 'is', null)
    .order('started_at', { ascending: false })
    .limit(RECENT_ROWS);

  if (!error) return { rows: (data ?? []) as SessionRow[], cached: true };

  // 42703: undefined column — the session_memory migration has not run here.
  // Fall back to the columns the init migration guarantees and skip caching.
  if (error.code === '42703') {
    const fallback = await admin
      .from('coach_sessions')
      .select('id, conversation_id, started_at')
      .eq('user_id', userId)
      .not('conversation_id', 'is', null)
      .order('started_at', { ascending: false })
      .limit(RECENT_ROWS);
    if (!fallback.error) {
      const rows = (fallback.data ?? []).map((r) => ({
        ...r,
        summary: null,
        summary_synced_at: null,
      })) as SessionRow[];
      return { rows, cached: false };
    }
    console.error('[memory] could not read sessions:', fallback.error.message);
    return null;
  }

  console.error('[memory] could not read sessions:', error.message);
  return null;
}

/**
 * The context block for a returning learner, or null for a first-timer (and
 * for any deployment where memory is unavailable).
 *
 * The block is data plus one framing line; how to *behave* with it — follow up
 * on the commitment, don't recite — lives in the persona, next to every other
 * behaviour rule.
 */
export async function learnerContext(userId: string): Promise<string | null> {
  if (!serviceConfigured()) return null;

  const recent = await recentSessions(userId);
  if (!recent) return null;
  const { rows, cached } = recent;

  const pending = rows
    .filter((r) => !r.summary_synced_at && !r.summary)
    .slice(0, cached ? BACKFILL_LIMIT : CONTEXT_SESSIONS);
  const fetched = await mapWithConcurrency(pending, 2, async (row) => ({
    id: row.id,
    summary: await backfillRow(row, cached),
  }));
  const fetchedById = new Map(fetched.map((f) => [f.id, f.summary]));

  const remembered = rows
    .map((row) => ({
      date: sessionDate(row.started_at),
      summary: row.summary ?? fetchedById.get(row.id) ?? null,
    }))
    .filter((r): r is { date: string; summary: string } => Boolean(r.summary))
    .slice(0, CONTEXT_SESSIONS)
    // Newest-first in the query; chronological reads better as a story.
    .reverse();

  /*
   * The commitment, stated separately and first.
   *
   * It is in the summaries too, in principle — but only if the automatic
   * summary happened to mention it, which is exactly the coin flip this
   * replaces. Given its own line, the follow-up the persona promises stops
   * depending on what a summariser chose to keep.
   *
   * Read after the backfill above, so a commitment captured moments ago on this
   * very pass is already visible.
   */
  const commitment = await openCommitment(userId);

  if (remembered.length === 0 && !commitment) return null;

  const blocks: string[] = [];
  if (commitment) {
    blocks.push(
      [
        'Compromiso pendiente de la última sesión. Pregunta pronto si lo hizo y qué pasó:',
        commitmentContext(commitment),
      ].join('\n'),
    );
  }
  if (remembered.length > 0) {
    blocks.push(
      [
        'Memoria de sesiones anteriores con esta misma persona (resúmenes automáticos; pueden venir en inglés):',
        ...remembered.map((r) => `- Sesión del ${r.date}: ${r.summary.slice(0, SUMMARY_CHARS)}`),
      ].join('\n'),
    );
  }

  return blocks.join('\n\n');
}
