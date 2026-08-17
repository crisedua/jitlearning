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

  await supabaseAdmin()
    .from('profiles')
    .update({ stripe_customer_id: customer.id })
    .eq('id', userId);

  return customer.id;
}

/**
 * Record that an event was handled, and report whether it is new.
 *
 * Stripe delivers at least once and retries anything that does not return 2xx, so
 * every handler runs more than once eventually. A duplicated
 * `checkout.session.completed` is harmless; a duplicated or reordered
 * subscription change is not, which is why this gate is in front of all of them.
 */
export async function firstDelivery(event: Stripe.Event): Promise<boolean> {
  const { error } = await supabaseAdmin()
    .from('billing_events')
    .insert({ id: event.id, type: event.type });

  if (!error) return true;

  // 23505: unique violation, meaning this event id is already recorded.
  if (error.code === '23505') return false;

  /*
   * Any other failure (the migration has not run, Postgres is unreachable) is
   * reported as "new" so the handler still runs. Losing an upgrade is worse than
   * applying one twice: applying twice sets the same plan to the same value.
   */
  console.error('[billing] could not record event, processing anyway:', error.message);
  return true;
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

  const { error } = await supabaseAdmin()
    .from('profiles')
    .update({
      plan_id: nextPlan,
      stripe_subscription_id: subscription.id,
      subscription_status: subscription.status,
      subscription_ends_at: endsAtSeconds ? new Date(endsAtSeconds * 1000).toISOString() : null,
      updated_at: new Date().toISOString(),
    })
    .eq('stripe_customer_id', customerId);

  if (error) {
    // Loud, and rethrown by the caller: a webhook that cannot write the plan must
    // return non-2xx so Stripe retries it, or somebody has paid for nothing.
    console.error('[billing] could not apply subscription:', error.message);
    throw new Error(error.message);
  }
}

export interface Subscription {
  planId: string;
  status: string | null;
  endsAt: string | null;
  hasCustomer: boolean;
}

/** What the learner is paying for, for the account UI. */
export async function subscriptionFor(userId: string): Promise<Subscription | null> {
  if (!serviceConfigured()) return null;

  const { data, error } = await supabaseAdmin()
    .from('profiles')
    .select('plan_id, subscription_status, subscription_ends_at, stripe_customer_id')
    .eq('id', userId)
    .maybeSingle();

  if (error || !data) return null;
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
  };
}
