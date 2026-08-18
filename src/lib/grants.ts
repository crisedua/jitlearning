/**
 * Comped plans: the /feedback deal, honoured.
 *
 * How long is `FEEDBACK_REWARD.months` and is deliberately not repeated here.
 * Two comments elsewhere named it and both said six while the page said three,
 * for weeks, because prose has no way to be wrong out loud.
 *
 * The site promises a few months of Fundador to the first few people who leave
 * real feedback. Everything about that promise lived in a sentence on a page:
 * nothing read the feedback, nothing could put somebody on a plan without a
 * Stripe subscription, nothing counted the seats, and nothing knew when the
 * the grant was up.
 *
 * The last one is the trap. A grant made by hand is indistinguishable from a
 * paid plan the moment it is made, so a bounded gift silently becomes
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

  /*
   * `count` because an update that matches nothing is not an error.
   *
   * Postgres reports zero rows changed and PostgREST returns success, so an id
   * with no profile row produced "Listo: 3 meses de Fundador, hasta el ..." on
   * screen and nothing at all in the database. The admin has just told somebody
   * their plan is active, on the strength of a message that was never true, and
   * the person finds out by running out of free minutes.
   *
   * This is the promise the site makes in public to its first learners. It is
   * the last place to accept a success that was not checked.
   */
  const { error, count } = await supabaseAdmin()
    .from('profiles')
    .update(
      {
        plan_id: planId,
        plan_granted_until: until.toISOString(),
        plan_grant_reason: reason,
      },
      { count: 'exact' },
    )
    .eq('id', userId);

  if (error) return { ok: false, error: error.message };
  if (count === 0) {
    return {
      ok: false,
      error: 'no existe un perfil para esa cuenta, así que no se activó nada. Pídele que entre una vez a la clase y vuelve a intentarlo.',
    };
  }
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

  const { error: writeError, count } = await supabaseAdmin()
    .from('profiles')
    .update({ plan_id: 'free', plan_granted_until: null }, { count: 'exact' })
    .eq('id', userId);

  if (writeError) {
    console.error('[grants] could not expire a grant:', writeError.message);
    return false;
  }
  /*
   * Reporting `true` here would say the grant ended when nothing was written,
   * and this runs on every mint: the caller would stop treating the plan as
   * comped while the profile still carries it, so somebody keeps a paid tier
   * for nothing, indefinitely, and the seat is never freed.
   */
  if (count === 0) {
    console.error(`[grants] no profile ${userId}: grant not expired`);
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
 * expired ones included: the seat was taken whether or not the grant is
 * still running.
 */
export function seatsLeft(grants: readonly Grant[]): number {
  const used = grants.filter((g) => g.reason === FEEDBACK_REASON).length;
  return Math.max(0, FEEDBACK_REWARD.seats - used);
}

/**
 * Accounts that exist for these addresses, keyed by lowercased email.
 *
 * Feedback is open to people who never signed in, because somebody who bounced
 * has the feedback a signup flow never hears. The cost was that the row carries
 * no `user_id`, so /admin/feedback said "pídele que entre con Google y vuelve a
 * esta página" — an instruction that could never come true, because the row was
 * stamped at submission and nothing rewrites it when the person signs up later.
 * The operator would return to the page, see the same sentence, and have no way
 * to keep a promise the site made in public.
 *
 * Matching on the address is the promise's own wording: the form says to use the
 * email you will enter with. It grants nothing to the submitter either way, only
 * to whoever owns that account, so a wrong or borrowed address cannot take a
 * seat from its owner. And an admin still presses the button.
 *
 * `listUsers` pages rather than filters, so this reads at most `MAX_PAGES` of
 * them. That is thousands of accounts, and it is the admin page for a product
 * with ten seats on offer; if it is ever not enough, the count is the reason to
 * change it rather than a silent truncation.
 */
export async function accountsByEmail(): Promise<Map<string, string>> {
  const found = new Map<string, string>();
  if (!serviceConfigured()) return found;

  const PER_PAGE = 200;
  const MAX_PAGES = 10;

  for (let page = 1; page <= MAX_PAGES; page++) {
    const { data, error } = await supabaseAdmin().auth.admin.listUsers({ page, perPage: PER_PAGE });
    if (error) return found;

    for (const user of data.users) {
      const email = user.email?.trim().toLowerCase();
      if (email && !found.has(email)) found.set(email, user.id);
    }
    if (data.users.length < PER_PAGE) break;
  }

  return found;
}
