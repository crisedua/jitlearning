/**
 * Delete everything this product holds about one person.
 *
 * `/privacidad` promises it: write to us and we delete your account and anything
 * carrying your name, including what is left at ElevenLabs. That promise had no
 * mechanism behind it. Doing it by hand means a psql session, a list of tables
 * remembered correctly under time pressure, and a separate pass over the
 * conversations API — which is how a row gets missed, and a missed row makes the
 * page a lie rather than a delay.
 *
 * ## What it does, and in what order
 *
 * The conversations first, because they are the only part this cannot find again
 * afterwards: they are located by the ids in `coach_sessions`, so deleting the
 * account first would strand the audio at ElevenLabs with nothing left pointing
 * at it. Then the auth user, which cascades to every table carrying `user_id`.
 * Two tables are deliberately `on delete set null` rather than cascade —
 * `feedback` and `purchase_intents` — so the account goes and an anonymous row
 * survives. That is the intent: feedback about the product outlives the person
 * who gave it, and a count of purchase attempts is not personal once the id is
 * gone. This says so rather than leaving somebody to wonder.
 *
 * ## Why it refuses to do anything by default
 *
 * Every other script here is idempotent and safe to re-run. This one is neither,
 * so it prints exactly what it would delete and stops. `--confirm` is the only
 * way anything is removed, and the email has to match a real account: a typo
 * that matched nothing would otherwise print a reassuring "done".
 */
import './env';
import { supabaseAdmin, serviceConfigured } from '../src/lib/supabase/admin';
import { agentId } from '../src/lib/config';

const RED = '\x1b[31m';
const DIM = '\x1b[2m';
const OFF = '\x1b[0m';

async function main() {
  const email = process.argv[2]?.trim().toLowerCase();
  const confirm = process.argv.includes('--confirm');

  if (!email || email.startsWith('--')) {
    console.error('\nUsage: npm run forget -- alguien@ejemplo.com [--confirm]\n');
    process.exit(1);
  }
  if (!serviceConfigured()) {
    console.error('\nSUPABASE_SERVICE_ROLE_KEY is not set, so nothing can be read or deleted.\n');
    process.exit(1);
  }

  const db = supabaseAdmin();

  /*
   * `listUsers` pages rather than filters, the same as `accountsByEmail`. A
   * product with ten seats on offer does not need more, and the alternative is
   * trusting an email column in `profiles` that is a copy rather than the record.
   */
  let userId: string | null = null;
  for (let page = 1; page <= 10 && !userId; page++) {
    const { data, error } = await db.auth.admin.listUsers({ page, perPage: 200 });
    if (error) {
      console.error(`\nCould not list accounts: ${error.message}\n`);
      process.exit(1);
    }
    userId = data.users.find((u) => u.email?.trim().toLowerCase() === email)?.id ?? null;
    if (data.users.length < 200) break;
  }

  if (!userId) {
    console.error(`\nNo account for ${email}. Nothing was deleted.\n`);
    process.exit(1);
  }

  const { data: sessions } = await db
    .from('coach_sessions')
    .select('conversation_id')
    .eq('user_id', userId)
    .not('conversation_id', 'is', null);

  const conversations = (sessions ?? [])
    .map((s) => (s as { conversation_id: string }).conversation_id)
    .filter(Boolean);

  const counts: Array<[string, number]> = [];
  for (const table of [
    'coach_sessions',
    'career_profiles',
    'plan_steps',
    'session_summaries',
  ]) {
    const { count } = await db
      .from(table)
      .select('*', { count: 'exact', head: true })
      .eq('user_id', userId);
    counts.push([table, count ?? 0]);
  }
  for (const table of ['feedback', 'purchase_intents']) {
    const { count } = await db
      .from(table)
      .select('*', { count: 'exact', head: true })
      .eq('user_id', userId);
    counts.push([`${table} (kept, id removed)`, count ?? 0]);
  }

  console.log(`\nAccount:       ${email}`);
  console.log(`               ${userId}`);
  console.log(`Conversations: ${conversations.length} at ElevenLabs`);
  for (const [table, count] of counts) console.log(`               ${count} in ${table}`);

  if (!confirm) {
    console.log(`\n${DIM}Nothing deleted. Re-run with --confirm to do it:${OFF}`);
    console.log(`\n  npm run forget -- ${email} --confirm\n`);
    return;
  }

  console.log(`\n${RED}Deleting.${OFF}\n`);

  const key = process.env.ELEVENLABS_API_KEY?.trim();
  let removed = 0;
  const stranded: string[] = [];

  if (key && agentId()) {
    for (const id of conversations) {
      const res = await fetch(`https://api.elevenlabs.io/v1/convai/conversations/${id}`, {
        method: 'DELETE',
        headers: { 'xi-api-key': key },
      });
      // 404 is already gone, which is the outcome asked for.
      if (res.ok || res.status === 404) removed++;
      else stranded.push(`${id} (HTTP ${res.status})`);
    }
  } else if (conversations.length > 0) {
    stranded.push(...conversations);
  }

  /*
   * Reported before the account goes, not after. Once the user row is deleted
   * the ids are unrecoverable, so a failure here has to be visible while
   * somebody can still write it down.
   */
  if (stranded.length > 0) {
    console.error(`${RED}! ${stranded.length} conversation(s) could not be deleted:${OFF}`);
    for (const s of stranded) console.error(`    ${s}`);
    console.error('\n  Delete them in the ElevenLabs dashboard before continuing.');
    console.error('  Nothing in the database has been touched, so this can be re-run.\n');
    process.exit(1);
  }

  const { error } = await db.auth.admin.deleteUser(userId);
  if (error) {
    console.error(`\n${RED}! The conversations are gone and the account is not: ${error.message}${OFF}\n`);
    process.exit(1);
  }

  console.log(`✓ ${removed} conversation(s) deleted at ElevenLabs`);
  console.log('✓ Account deleted, and every table carrying its id with it');
  console.log(`${DIM}  feedback and purchase_intents keep their rows with the id set to null.${OFF}\n`);
}

main().catch((err) => {
  console.error(err instanceof Error ? err.message : err);
  process.exit(1);
});
