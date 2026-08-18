/**
 * Taking money, and the one rule that governs it.
 *
 * **`plan_id` is set by the Stripe webhook and by nothing else.** Not by the
 * browser, not by the checkout route, not optimistically after a redirect. The
 * checkout route only mints a URL; the plan changes when Stripe says a payment
 * happened. That is the difference between a paywall and a suggestion, and
 * `plan_id` is what `checkPlanAllowance` reads to decide how many minutes
 * somebody gets.
 *
 * ## Why Stripe
 *
 * The plans are already priced in USD, hosted Checkout keeps card data off this
 * app's surface entirely (no PCI scope, no card fields to get wrong), and the
 * billing portal means cancelling does not require emailing a person. Chile is
 * supported and Checkout offers local methods per country on its own.
 *
 * The swap point if this ever needs to be Mercado Pago instead: everything
 * Stripe-shaped lives in this file, the two routes under `api/`, and
 * `plans.stripe_price_id`. Nothing else in the app knows how money arrives.
 *
 * ## What is deliberately not here
 *
 * No proration maths, no coupon logic, no invoice rendering, no dunning emails.
 * Stripe does all of it better, and the billing portal exposes it to the learner
 * directly. The job of this file is to keep one column in Postgres agreeing with
 * one subscription in Stripe.
 */
import Stripe from 'stripe';
import { serviceConfigured, supabaseAdmin } from './supabase/admin';

/**
 * Statuses that mean "this person is paying and should have their plan".
 *
 * `past_due` is included on purpose: a card that failed a retry is a dunning
 * problem, not a reason to cut off somebody mid-plan who probably just needs to
 * update a card. Stripe cancels the subscription itself once retries run out, and
 * that arrives as `customer.subscription.deleted`.
 */
const PAYING = new Set(['active', 'trialing', 'past_due']);

/** Postgres: undefined column. Means a migration has not been applied here. */
const UNDEFINED_COLUMN = '42703';

export function billingConfigured(): boolean {
  return Boolean(process.env.STRIPE_SECRET_KEY?.trim());
}

export function stripe(): Stripe {
  const key = process.env.STRIPE_SECRET_KEY?.trim();
  if (!key) throw new Error('STRIPE_SECRET_KEY is not configured.');
  // Pinned by the SDK's own default: an unpinned account default can change under
  // a deployed app, and a webhook payload shape changing silently is the worst
  // way to find that out.
  return new Stripe(key);
}

/** The plan a price id belongs to, or null when Stripe sends one we do not sell. */
async function planForPrice(priceId: string): Promise<string | null> {
  const { data, error } = await supabaseAdmin()
    .from('plans')
    .select('id')
    .eq('stripe_price_id', priceId)
    .maybeSingle();

  if (error || !data) return null;
  return (data as { id: string }).id;
}

/** A paid, public plan that can actually be bought, or null. */
export async function purchasablePlan(
  planId: string,
): Promise<{ id: string; name: string; priceId: string } | null> {
  if (!serviceConfigured()) return null;

  const { data, error } = await supabaseAdmin()
    .from('plans')
    .select('id, name, price_minor, is_public, stripe_price_id')
    .eq('id', planId)
    .maybeSingle();

  if (error || !data) return null;
  const row = data as {
    id: string;
    name: string;
    price_minor: number;
    is_public: boolean;
    stripe_price_id: string | null;
  };

  // A retired tier, the free tier, or one nobody has created in Stripe yet. All
  // three are refused here rather than producing a checkout that cannot complete.
  if (!row.is_public || row.price_minor <= 0 || !row.stripe_price_id) return null;
  return { id: row.id, name: row.name, priceId: row.stripe_price_id };
}

/** The learner's existing Stripe customer id, or null. Creates nothing. */
export async function customerIdFor(userId: string): Promise<string | null> {
  if (!serviceConfigured()) return null;

  const { data, error } = await supabaseAdmin()
    .from('profiles')
    .select('stripe_customer_id')
    .eq('id', userId)
    .maybeSingle();

  if (error || !data) return null;
  return (data as { stripe_customer_id: string | null }).stripe_customer_id ?? null;
}

/** The learner's Stripe customer id, creating the customer on first purchase. */
export async function customerFor(
  userId: string,
  email: string | undefined,
): Promise<string> {
  const existing = await customerIdFor(userId);
  if (existing) return existing;

  /*
   * `metadata.user_id` is the thread back to us.
   *
   * Every later webhook arrives keyed by customer or subscription, and this is
   * what makes those resolvable even if the local row were somehow lost. It is
   * also what a human debugging a payment in the Stripe dashboard needs first.
   */
  const customer = await stripe().customers.create({
    email,
    metadata: { user_id: userId },
  });

  /*
   * This is the row the webhook will look this customer up by, so losing it
   * loses the payment. The result was discarded entirely: an update matching no
   * profile is not an error, so a missing row wrote nothing, returned nothing,
   * and handed back a customer id that no profile carries. Checkout then
   * succeeds, the subscription webhook finds no profile for that customer, and
   * the person has paid for a plan nothing can attach to them.
   */
  const { error, count } = await supabaseAdmin()
    .from('profiles')
    .update({ stripe_customer_id: customer.id }, { count: 'exact' })
    .eq('id', userId);

  if (error || count === 0) {
    console.error(
      `[billing] could not attach customer ${customer.id} to profile ${userId}:`,
      error?.message ?? 'no profile row',
    );
    throw new Error('No pudimos preparar tu cuenta para el pago. Vuelve a intentarlo.');
  }

  return customer.id;
}

/**
 * Claim an event for processing, and report whether to process it.
 *
 * Stripe delivers at least once and retries anything that does not return 2xx, so
 * every handler runs more than once eventually. A duplicated
 * `checkout.session.completed` is harmless; a duplicated or reordered
 * subscription change is not, which is why this gate is in front of all of them.
 *
 * ## Claimed is not handled
 *
 * This used to record the id and treat "already recorded" as "already applied".
 * Those are different, and the gap between them is where a paid upgrade
 * disappears: the id goes in, the handler throws, the route returns 500 so Stripe
 * will retry, and the retry finds the id present and is waved through with a 200.
 * The customer has been charged, sits on the free plan permanently, and no
 * further delivery is coming. The webhook route describes that exact outcome as
 * the worst failure this app can have, in the comment explaining why its handlers
 * return 500 — and the gate in front of them caused it.
 *
 * So the insert claims, and `markHandled` completes. A row claimed but never
 * completed is reprocessed on the next delivery: applying a subscription twice
 * sets the same plan to the same value, and not applying it at all does not.
 */
export async function claimEvent(event: Stripe.Event): Promise<boolean> {
  const { error } = await supabaseAdmin()
    .from('billing_events')
    .insert({ id: event.id, type: event.type });

  if (!error) return true;

  // 23505: unique violation, meaning this event id is already claimed. Whether
  // it was ever finished is the question that decides what happens next.
  if (error.code === '23505') {
    const { data, error: readError } = await supabaseAdmin()
      .from('billing_events')
      .select('handled_at')
      .eq('id', event.id)
      .maybeSingle();

    /*
     * Unreadable, or the column does not exist because the migration has not
     * run: process it. The cost of processing twice is nothing; the cost of
     * skipping the delivery that would have applied a payment is everything.
     */
    if (readError || !data) return true;
    return (data as { handled_at: string | null }).handled_at === null;
  }

  console.error('[billing] could not claim event, processing anyway:', error.message);
  return true;
}

/** Mark the claim finished. Only ever called after the handler returned. */
export async function markHandled(eventId: string): Promise<void> {
  const { error, count } = await supabaseAdmin()
    .from('billing_events')
    .update({ handled_at: new Date().toISOString() }, { count: 'exact' })
    .eq('id', eventId);

  /*
   * Logged and swallowed. The work is already done and the customer already has
   * what they paid for; the only consequence is that a retry would redo it,
   * which is safe. Turning this into a 500 would ask Stripe to redo it for sure.
   */
  if (error) console.error('[billing] could not mark event handled:', error.message);
  // Same swallow, same reason, but say which happened: no row means the claim
  // is missing, so this event will be treated as new if Stripe sends it again.
  else if (count === 0) console.error(`[billing] no claim row for event ${eventId}`);
}

/**
 * Which plan a subscription entitles somebody to.
 *
 * Pulled out of `applySubscription` so the decision can be tested without a
 * database, because it is the decision that decides whether a paying customer
 * gets what they paid for. Two rules, both deliberate:
 *
 * `past_due` still pays. A card that failed a retry is a dunning problem, not a
 * reason to cut off somebody mid-month; Stripe cancels on its own once retries run
 * out, and that arrives as a `deleted` event.
 *
 * Anything else returns `free`, never null. `plan_id` is a non-null foreign key
 * and the gate reads it on every mint, so "no plan" is not a state this schema can
 * represent, and `free` is the honest meaning: they keep their history, the minutes
 * stop.
 */
export function planFor(status: string, planId: string | null): string {
  return PAYING.has(status) && planId ? planId : 'free';
}

/**
 * Put the learner on the plan their subscription pays for.
 *
 * The one function in the app that writes `plan_id`. Everything about which plan
 * comes from Stripe's own copy of the subscription — the price id on the line
 * item — rather than from anything the browser sent, so a tampered checkout
 * cannot buy the cheap plan and receive the expensive one.
 */
export async function applySubscription(subscription: Stripe.Subscription): Promise<void> {
  if (!serviceConfigured()) return;

  const customerId =
    typeof subscription.customer === 'string' ? subscription.customer : subscription.customer.id;

  const priceId = subscription.items.data[0]?.price?.id;
  const planId = priceId ? await planForPrice(priceId) : null;
  const nextPlan = planFor(subscription.status, planId);

  const endsAtSeconds = (subscription as unknown as { current_period_end?: number })
    .current_period_end;

  const { error, count } = await supabaseAdmin()
    .from('profiles')
    .update(
      {
        plan_id: nextPlan,
        stripe_subscription_id: subscription.id,
        subscription_status: subscription.status,
        subscription_ends_at: endsAtSeconds ? new Date(endsAtSeconds * 1000).toISOString() : null,
        updated_at: new Date().toISOString(),
      },
      { count: 'exact' },
    )
    .eq('stripe_customer_id', customerId);

  if (error) {
    // Loud, and rethrown by the caller: a webhook that cannot write the plan must
    // return non-2xx so Stripe retries it, or somebody has paid for nothing.
    console.error('[billing] could not apply subscription:', error.message);
    throw new Error(error.message);
  }

  /*
   * Matching no row is the same failure, and it did not throw.
   *
   * An update whose filter matches nothing is a success in Postgres and in
   * PostgREST: no error, no rows. So a customer id with no profile against it
   * wrote nothing, this returned cleanly, the route answered 200, and Stripe
   * never retried. Somebody paid and stayed on the free plan, permanently, with
   * a green tick in the Stripe dashboard.
   *
   * The rule three lines up already covers this case, it just never reached it.
   * Throwing makes the delivery fail and retry, and if the profile genuinely has
   * no customer id the retries end as a visible failed webhook, which is the
   * outcome to want: an operator who can see a problem beats a customer who
   * quietly got nothing.
   */
  if (count === 0) {
    console.error(`[billing] no profile carries stripe_customer_id ${customerId}`);
    throw new Error(`No profile for customer ${customerId}`);
  }
}

/**
 * Whether this plan was given rather than bought.
 *
 * `/progreso` decided this from `!hasCustomer`, and every early customer of this
 * product will lack a Stripe customer: checkout is not configured, so a sale
 * happens over WhatsApp and the plan is set by hand. That person was labelled
 * "de cortesía" and told there was nothing to pay or cancel, minutes after
 * paying.
 *
 * `grantedUntil` is written by `grantPlan` and by nothing else, so it says
 * exactly what the label means. A plan with an end date we set is a courtesy. A
 * plan with no customer and no end date is somebody who paid a person, and they
 * get told how to change it rather than that there is nothing to change.
 */
export function isComped(subscription: Pick<Subscription, 'grantedUntil'>): boolean {
  return subscription.grantedUntil !== null;
}

export interface Subscription {
  planId: string;
  status: string | null;
  /** When a *paid* subscription renews or lapses. Null for a comped plan. */
  endsAt: string | null;
  hasCustomer: boolean;
  /**
   * When a comped plan reverts to free, or null when the plan was bought.
   *
   * Separate from `endsAt` because they come from different places and mean
   * different things: one is Stripe's, one is ours. The notebook was showing
   * only Stripe's, so somebody on a granted plan saw "de cortesía" with no date
   * and the line "no hay nada que pagar ni que cancelar" — true, and silent
   * about the fact that it ends. The first ten people are exactly the ones on
   * granted plans.
   */
  grantedUntil: string | null;
}

/** What the learner is paying for, for the account UI. */
export async function subscriptionFor(userId: string): Promise<Subscription | null> {
  if (!serviceConfigured()) return null;

  const { data, error } = await supabaseAdmin()
    .from('profiles')
    .select('plan_id, subscription_status, subscription_ends_at, stripe_customer_id')
    .eq('id', userId)
    .maybeSingle();

  /*
   * The plan survives a missing billing migration.
   *
   * Three of the four columns above are added by 20260813000000_billing.sql.
   * `plan_id` is not: it predates all of it, and it is the only one the offer
   * needs. This used to return null on any error, silently, so a deployment that
   * had not run that migration made every learner read as "no subscription" —
   * and `/progreso` renders its offer only when the subscription says `free`.
   *
   * The result was the worst possible shape of failure: somebody finishes a
   * task, measures the hours, sees the number, and is never asked to pay,
   * because a migration about Stripe was missing. Nothing logged, nothing broke,
   * and the one screen where the product asks for money quietly did not.
   */
  if (error?.code === UNDEFINED_COLUMN) {
    const basic = await supabaseAdmin()
      .from('profiles')
      .select('plan_id')
      .eq('id', userId)
      .maybeSingle();

    if (basic.error || !basic.data) return null;
    return {
      planId: (basic.data as { plan_id: string }).plan_id,
      status: null,
      endsAt: null,
      hasCustomer: false,
      grantedUntil: null,
    };
  }

  if (error) {
    console.error('[billing] could not read the subscription:', error.message);
    return null;
  }

  /*
   * No profile row is a free learner, not an unknown one.
   *
   * `syncProfile` writes that row at sign-in and is best-effort on purpose: a
   * failure there must not block a sign-in Supabase already accepted. So a
   * learner can exist, have a class and measure their hours with no row here,
   * until their next sign-in writes one.
   *
   * Returning null for them costs exactly what the comment above describes for a
   * missing migration: `/progreso` shows the offer only when the subscription
   * reads `free`, so somebody who did the work and saw the number is never asked
   * to pay. The same silent failure through a different door.
   *
   * Free is also the safe direction. Nothing grants access from this — the
   * allowance is metered from `plan_usage` — so the worst this can do is offer a
   * plan to somebody who already has one, and a paid plan always has a row,
   * because paying is what writes it.
   */
  if (!data) {
    return { planId: 'free', status: null, endsAt: null, hasCustomer: false, grantedUntil: null };
  }

  const row = data as {
    plan_id: string;
    subscription_status: string | null;
    subscription_ends_at: string | null;
    stripe_customer_id: string | null;
  };

  return {
    planId: row.plan_id,
    status: row.subscription_status,
    endsAt: row.subscription_ends_at,
    hasCustomer: Boolean(row.stripe_customer_id),
    grantedUntil: await grantedUntil(userId),
  };
}

/**
 * When a comped plan reverts, read on its own so it cannot take the rest down.
 *
 * `plan_granted_until` arrives three migrations after the billing columns beside
 * it. Selecting them together meant a database with billing and without grants
 * failed the whole read with 42703 and fell through to the plan id alone —
 * which reports `hasCustomer: false`, which `/progreso` reads as a courtesy
 * plan. A paying customer would have been told their subscription was a gift
 * and shown no way to cancel it, because a column about *free* plans was
 * missing.
 *
 * That was mine, added while making the courtesy plan honest about its expiry
 * date. The lesson is the one this codebase keeps teaching: a read that needs
 * one column should not fail because of another, and the newer the column the
 * more true that is.
 */
async function grantedUntil(userId: string): Promise<string | null> {
  const { data, error } = await supabaseAdmin()
    .from('profiles')
    .select('plan_granted_until')
    .eq('id', userId)
    .maybeSingle();

  if (error || !data) return null;
  return (data as { plan_granted_until: string | null }).plan_granted_until;
}
