/**
 * Whether the post-call webhook is actually landing, asked of the data.
 *
 * Every other check on this is a check on configuration, and configuration is
 * not what fails. The secret can be set in both places, the probe can return
 * 401, and the webhook can still never arrive: registered against the wrong URL,
 * pointed at a preview deployment, switched off, or subscribed to the wrong
 * event. All four look identical from inside the app, and all four produce
 * silence.
 *
 * The silence is not merely lost rows. `buildRecord` correctly treats a learner
 * with no history as new, so a returning learner is diagnosed from scratch every
 * time and the memory `/planes` sells never happens. They do not conclude that a
 * webhook is misconfigured. They conclude it does not remember them.
 *
 * Written once and read by both `npm run doctor` and `/admin/estado`, which had
 * a copy each — including the grace window, which is a judgement about how long
 * delivery may reasonably take and therefore exactly the number that would drift
 * apart and leave the two disagreeing about whether anything is wrong.
 */
import { serviceConfigured, supabaseAdmin } from './supabase/admin';

export interface Delivery {
  /** Conversations old enough that a summary should have arrived. */
  settled: number;
  /** How many of those have none. */
  missing: number;
  /** Set when the tables could not be read at all, which is not the same thing. */
  unreadable: string | null;
}

/**
 * A call that ended a minute ago has not had time to be delivered, and counting
 * it as lost would make this cry wolf on the one check somebody runs straight
 * after their first class.
 */
const GRACE_MINUTES = 15;

export async function deliveryReport(): Promise<Delivery | null> {
  if (!serviceConfigured()) return null;

  const [convos, summaries] = await Promise.all([
    supabaseAdmin()
      .from('coach_sessions')
      .select('conversation_id, started_at')
      .not('conversation_id', 'is', null)
      .order('started_at', { ascending: false })
      .limit(200),
    supabaseAdmin().from('session_summaries').select('conversation_id').limit(500),
  ]);

  if (convos.error || summaries.error) {
    return {
      settled: 0,
      missing: 0,
      unreadable: convos.error?.message ?? summaries.error?.message ?? 'unknown',
    };
  }

  const cutoff = Date.now() - GRACE_MINUTES * 60_000;
  const settled = (convos.data ?? []).filter(
    (c) => new Date((c as { started_at: string }).started_at).getTime() < cutoff,
  );
  const landed = new Set(
    (summaries.data ?? []).map((r) => (r as { conversation_id: string | null }).conversation_id),
  );

  return {
    settled: settled.length,
    missing: settled.filter(
      (c) => !landed.has((c as { conversation_id: string | null }).conversation_id),
    ).length,
    unreadable: null,
  };
}
