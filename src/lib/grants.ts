/**
 * Comped plans: the /feedback deal, honoured.
 *
 * The site promises three months of Fundador to the first ten people who leave
 * real feedback. Everything about that promise lived in a sentence on a page:
 * nothing read the feedback, nothing could put somebody on a plan without a
 * Stripe subscription, nothing counted the seats, and nothing knew when the
 * three months were up.
 *
 * The last one is the trap. A grant made by hand is indistinguishable from a
 * paid plan the moment it is made, so "three months free" silently becomes
 * "free forever" and the only way to notice is to remember. This module is what
 * makes the promise finite.
 *
 * ## Expiry is lazy, and that is on purpose
 *
 * There is no scheduler here. `expireGrantIfDue` runs inside
 * `checkPlanAllowance`, which is the single choke point every billable
 * conversation already passes through. So a grant ends the next time the person
 * tries to use what it gave them, which is the only moment it matters, and there
 * is no cron job to forget to deploy.
 *
 * The gap that leaves is a person whose grant expired and who never comes back:
 * their row says `founder` forever. That costs nothing, because the cost is
 * conversation minutes and they are not having any, and `/admin/feedback` lists
 * them anyway.
 */
import { serviceConfigured, supabaseAdmin } from './supabase/admin';
import { FEEDBACK_REWARD } from './site';

export interface Grant {
  userId: string;
  email: string | null;
  planId: string;
  until: string;
  reason: string | null;
  expired: boolean;
}

/** The reason recorded for a grant made from the feedback deal. */
export const FEEDBACK_REASON = 'feedback';

/**
 * Put somebody on a plan without a payment, for a fixed number of months.
 *
 * Writes `plan_id` itself rather than inventing a parallel notion of
 * entitlement: `plan_usage` joins that column, so the gate, the balance meter
 * and the offer all follow with no new code path. The two grant columns record
 * what `plan_id` cannot say on its own.
 */
export async function grantPlan(
  userId: string,
  planId: string,
  months: number,
  reason: string = FEEDBACK_REASON,
): Promise<{ ok: true; until: string } | { ok: false; error: string }> {
  if (!serviceConfigured()) return { ok: false, error: 'Supabase service role is not configured.' };

  const until = new Date();
  until.setMonth(until.getMonth() + months);

  const { error } = await supabaseAdmin()
    .from('profiles')
    .update({
      plan_id: planId,
      plan_granted_until: until.toISOString(),
      plan_grant_reason: reason,
    })
    .eq('id', userId);

  if (error) return { ok: false, error: error.message };
  return { ok: true, until: until.toISOString() };
}

/**
 * End a grant that has run out, and say whether it did.
 *
 * Called on every mint. Reverts to `free` rather than to whatever they were on
 * before, because before a grant there is nothing: somebody who had been paying
 * would have a Stripe subscription, and a subscription event would put them back
 * on their real plan the moment anything about it changed.
 *
 * A grant on somebody who later actually paid is cleared by `applySubscription`
 * writing `plan_id`, so the two cannot fight: this only ever fires while
 * `plan_granted_until` is still set, and a real payment is what clears it.
 */
export async function expireGrantIfDue(userId: string): Promise<boolean> {
  if (!serviceConfigured()) return false;

  const { data, error } = await supabaseAdmin()
    .from('profiles')
    .select('plan_granted_until')
    .eq('id', userId)
    .maybeSingle();

  // Missing column means the migration has not run. Nothing to expire, and
  // failing the mint over it would lock people out of a working product.
  if (error || !data) return false;

  const until = (data as { plan_granted_until: string | null }).plan_granted_until;
  if (!until || new Date(until).getTime() > Date.now()) return false;

  const { error: writeError } = await supabaseAdmin()
    .from('profiles')
    .update({ plan_id: 'free', plan_granted_until: null })
    .eq('id', userId);

  if (writeError) {
    console.error('[grants] could not expire a grant:', writeError.message);
    return false;
  }
  return true;
}

/** Every grant ever made, newest first. The seat count is derived from this. */
export async function listGrants(): Promise<Grant[]> {
  if (!serviceConfigured()) return [];

  const { data, error } = await supabaseAdmin()
    .from('profiles')
    .select('id, email, plan_id, plan_granted_until, plan_grant_reason')
    .not('plan_grant_reason', 'is', null)
    .order('plan_granted_until', { ascending: false });

  if (error || !data) return [];

  const now = Date.now();
  return (
    data as Array<{
      id: string;
      email: string | null;
      plan_id: string;
      plan_granted_until: string | null;
      plan_grant_reason: string | null;
    }>
  ).map((row) => ({
    userId: row.id,
    email: row.email,
    planId: row.plan_id,
    until: row.plan_granted_until ?? '',
    reason: row.plan_grant_reason,
    expired: !row.plan_granted_until || new Date(row.plan_granted_until).getTime() <= now,
  }));
}

/**
 * Seats left in the offer the site makes.
 *
 * "Solo para las primeras diez personas" is a number printed on a public page,
 * so it has to be answerable. Counts grants made for the feedback reason,
 * expired ones included: the seat was taken whether or not the three months are
 * still running.
 */
export function seatsLeft(grants: readonly Grant[]): number {
  const used = grants.filter((g) => g.reason === FEEDBACK_REASON).length;
  return Math.max(0, FEEDBACK_REWARD.seats - used);
}
