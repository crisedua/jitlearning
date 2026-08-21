/**
 * Fetch the words of past classes and store them, so learners can read them.
 *
 *   npm run backfill:transcripts
 *
 * Transcripts started being stored when the post-call webhook learned to keep
 * them. Every class before that has a usage row, usually a summary, and no
 * words — they are still on the ElevenLabs side, which is where this gets them.
 *
 * It also covers a gap that has nothing to do with the feature being new. When
 * `ELEVENLABS_WEBHOOK_SECRET` is missing from a deployment the webhook answers
 * 503 to every delivery, so nothing is written for as long as that lasts: no
 * summary, and now no transcript either. This is what repairs that stretch
 * afterwards, and the only thing that can — ElevenLabs does not redeliver
 * weeks later.
 *
 * Safe to run repeatedly. Rows already stored are skipped by conversation id
 * before a single request is made, so a second run costs almost nothing.
 */
import './env';
import { getConversation } from '../src/lib/elevenlabs';
import { supabaseAdmin, serviceConfigured } from '../src/lib/supabase/admin';
import { saveTranscript } from '../src/lib/transcripts';

/**
 * A ceiling on one run, so a first pass over a long history cannot spend an
 * afternoon making requests. Run it again for the next batch.
 */
const BATCH = 200;

interface SessionRow {
  user_id: string;
  conversation_id: string;
}

async function main() {
  if (!serviceConfigured()) {
    console.error(
      '\nNEXT_PUBLIC_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY must be set to backfill.\n',
    );
    process.exit(1);
  }

  const db = supabaseAdmin();

  /*
   * From `coach_sessions`, not `session_summaries`.
   *
   * The rows worth repairing are exactly the ones whose summary never arrived:
   * a class that happened while the webhook was answering 503 has a usage row
   * and nothing else. Reading from the summaries would skip precisely the
   * classes this exists for.
   */
  const { data: sessions, error } = await db
    .from('coach_sessions')
    .select('user_id, conversation_id')
    .not('conversation_id', 'is', null)
    .order('started_at', { ascending: false })
    .limit(BATCH);

  if (error) throw new Error(`Could not read coach_sessions: ${error.message}`);

  const rows = (sessions ?? []) as SessionRow[];
  if (rows.length === 0) {
    console.log('\nNo classes with a conversation id to fetch.\n');
    return;
  }

  const { data: have } = await db
    .from('session_transcripts')
    .select('conversation_id')
    .in('conversation_id', rows.map((r) => r.conversation_id));

  const stored = new Set(
    ((have ?? []) as { conversation_id: string }[]).map((r) => r.conversation_id),
  );

  const todo = rows.filter((r) => !stored.has(r.conversation_id));
  console.log(`\n  ${rows.length} class(es) found, ${todo.length} without stored words.\n`);

  let saved = 0;
  let empty = 0;
  let failed = 0;

  for (const row of todo) {
    try {
      const detail = await getConversation(row.conversation_id);
      const turns = await saveTranscript(row.user_id, row.conversation_id, detail.transcript);
      if (turns > 0) {
        saved++;
        console.log(`  ok    ${row.conversation_id}  ${turns} turn(s)`);
      } else {
        // A conversation that connected and said nothing. Real, and not a
        // failure: counted separately so a run of them is visible.
        empty++;
        console.log(`  --    ${row.conversation_id}  nothing was said`);
      }
    } catch (err) {
      failed++;
      console.error(`  FAIL  ${row.conversation_id}: ${(err as Error).message}`);
    }
  }

  console.log(`\n  ${saved} stored, ${empty} empty, ${failed} failed.\n`);
  if (rows.length === BATCH) {
    console.log(`  Stopped at the ${BATCH}-class batch limit. Run again for the rest.\n`);
  }
}

void main();
