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
 * This walks the agent's conversations on the ElevenLabs side and overwrites the
 * numbers with theirs, stamping `usage_synced_at`. After a run, any row with
 * that stamp is a receipt; any row without one is still an estimate.
 *
 * Safe to run repeatedly, and safe to run on a schedule — it only touches rows
 * that have not been synced yet.
 */
import './env';
import { listConversations, type ConversationSummary } from '../src/lib/elevenlabs';
import { supabaseAdmin, serviceConfigured } from '../src/lib/supabase/admin';
import { agentId } from '../src/lib/config';
import { TEACHER } from '../src/lib/teacher';

/** How many conversations to pull per request. */
const PAGE_SIZE = 100;

/**
 * A stop, so a misconfigured agent cannot page forever. Fifty pages is five
 * thousand conversations, which is well past any backlog this script would meet
 * before somebody notices it has not been run.
 */
const MAX_PAGES = 50;

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

  const agent = agentId();
  if (!agent) {
    console.error(`\n${TEACHER.envKey} is not set. Run \`npm run setup:agent\` first.\n`);
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
   * Rows are matched by conversation id, and the ElevenLabs side is paged.
   *
   * This used to fetch a single page of the hundred most recent conversations
   * and match up to five hundred pending rows against it. Anything older than
   * that window could never be reconciled, no matter how often the script ran,
   * so those rows kept their browser-reported numbers forever and the run
   * reported them as "unmatched" as though it were a transient state. Since
   * nothing schedules this script, the backlog is exactly the case that matters:
   * the first run after a busy week is the one with more than a page in it.
   *
   * So it pages until every pending id is accounted for, or the list runs out.
   */
  const wanted = new Set(rows.map((r) => r.conversation_id).filter(Boolean) as string[]);
  const byId = new Map<string, ConversationSummary>();
  let pages = 0;

  try {
    let cursor: string | undefined;
    do {
      const page = await listConversations(agent, PAGE_SIZE, cursor);
      pages++;
      for (const c of page.conversations) {
        if (wanted.has(c.conversation_id)) byId.set(c.conversation_id, c);
      }
      // Stop as soon as every row we came for is in hand: the pages are newest
      // first, so there is nothing further back worth reading.
      if (byId.size >= wanted.size) break;
      cursor = page.has_more ? (page.next_cursor ?? undefined) : undefined;
    } while (cursor && pages < MAX_PAGES);

    if (pages >= MAX_PAGES && byId.size < wanted.size) {
      console.warn(
        `  ! stopped after ${MAX_PAGES} pages with ${wanted.size - byId.size} row(s) still unfound.`,
      );
    }
  } catch (err) {
    console.warn(
      `  ! could not list conversations — ${err instanceof Error ? err.message : err}`,
    );
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
      `  ${unmatched} still unmatched — no conversation id on the row, so there is nothing on the ElevenLabs side to match.`,
    );
  }
  console.log('');
}

main().catch((err) => {
  console.error(err instanceof Error ? err.message : err);
  process.exit(1);
});
