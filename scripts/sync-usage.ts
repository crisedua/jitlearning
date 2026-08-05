/**
 * Reconcile the usage ledger against ElevenLabs.
 *
 *   npm run sync:usage
 *
 * Every `coach_sessions` row starts life self-reported: the browser says how
 * long it talked and how many turns there were. That is fine for showing a
 * learner their own history and useless for anything with money attached — a
 * closed laptop reports nothing, and a hostile tab could report anything.
 *
 * This walks every coach agent's conversations on the ElevenLabs side and
 * overwrites the numbers with theirs, stamping `usage_synced_at`. After a run,
 * any row with that stamp is a receipt; any row without one is still an
 * estimate.
 *
 * All coaches, not just one: `coach_sessions.agent_id` records which agent a
 * session ran against, and a row can only be reconciled against the agent that
 * actually held the conversation. Walking one agent would leave every session
 * with the other coaches permanently self-reported.
 *
 * Safe to run repeatedly, and safe to run on a schedule — it only touches rows
 * that have not been synced yet.
 */
import './env';
import { listConversations, type ConversationSummary } from '../src/lib/elevenlabs';
import { supabaseAdmin, serviceConfigured } from '../src/lib/supabase/admin';
import { agentId } from '../src/lib/config';
import { availableCoaches } from '../src/lib/coaches';

/** How far back to look on the ElevenLabs side in one run. */
const PAGE_SIZE = 100;

interface PendingRow {
  id: string;
  conversation_id: string | null;
  started_at: string;
}

async function main() {
  if (!serviceConfigured()) {
    console.error(
      '\nNEXT_PUBLIC_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY must be set to sync usage.\n',
    );
    process.exit(1);
  }

  const agents = availableCoaches()
    .map((coach) => ({ coach, id: agentId(coach) }))
    .filter((a): a is { coach: (typeof a)['coach']; id: string } => Boolean(a.id));

  if (agents.length === 0) {
    console.error('\nNo coach agent ids are set. Run `npm run setup:agent` first.\n');
    process.exit(1);
  }

  const db = supabaseAdmin();

  const { data: pending, error } = await db
    .from('coach_sessions')
    .select('id, conversation_id, started_at')
    .is('usage_synced_at', null)
    .order('started_at', { ascending: false })
    .limit(500);

  if (error) throw new Error(`Could not read coach_sessions: ${error.message}`);

  const rows = (pending ?? []) as PendingRow[];
  if (rows.length === 0) {
    console.log('\nNothing to sync — every session already carries ElevenLabs numbers.\n');
    return;
  }

  /*
   * One page per agent, merged. Conversation ids are unique across the
   * workspace, so a flat map is enough — a row is matched by its own
   * conversation id regardless of which coach produced it.
   */
  const byId = new Map<string, ConversationSummary>();
  for (const { coach, id } of agents) {
    try {
      const { conversations } = await listConversations(id, PAGE_SIZE);
      for (const c of conversations) byId.set(c.conversation_id, c);
    } catch (err) {
      console.warn(
        `  ! ${coach.label}: could not list conversations — ${
          err instanceof Error ? err.message : err
        }`,
      );
    }
  }

  let synced = 0;
  let unmatched = 0;

  for (const row of rows) {
    // No conversation id means the learner never got as far as connecting, or
    // the browser never reported back. Either way there is nothing on the
    // ElevenLabs side to match, and the row stays an estimate.
    const remote = row.conversation_id ? byId.get(row.conversation_id) : undefined;
    if (!remote) {
      unmatched++;
      continue;
    }

    const { error: updateError } = await db
      .from('coach_sessions')
      .update({
        duration_seconds: remote.call_duration_secs,
        message_count: remote.message_count,
        usage_synced_at: new Date().toISOString(),
      })
      .eq('id', row.id);

    if (updateError) {
      console.error(`  FAIL  ${row.id}: ${updateError.message}`);
      continue;
    }
    synced++;
  }

  console.log(`\n  ${synced} session(s) reconciled with ElevenLabs.`);
  if (unmatched > 0) {
    console.log(
      `  ${unmatched} still unmatched — no conversation id, or older than the last ${PAGE_SIZE} conversations.`,
    );
  }
  console.log('');
}

main().catch((err) => {
  console.error(err instanceof Error ? err.message : err);
  process.exit(1);
});
