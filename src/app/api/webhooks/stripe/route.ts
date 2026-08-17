/**
 * The only code path in this app that changes what somebody is paying for.
 *
 * Stripe posts here when a checkout completes, when a subscription changes, and
 * when one ends. `applySubscription` reads the plan off Stripe's own copy of the
 * subscription and writes `profiles.plan_id`, which is what `checkPlanAllowance`
 * reads on every mint.
 *
 * ## Setup
 *
 *   Stripe dashboard -> Developers -> Webhooks -> Add endpoint
 *   URL:    https://<app>.vercel.app/api/webhooks/stripe
 *   Events: checkout.session.completed
 *           customer.subscription.created
 *           customer.subscription.updated
 *           customer.subscription.deleted
 *   Copy the signing secret into STRIPE_WEBHOOK_SECRET.
 *
 * ## Why the raw body matters
 *
 * The signature covers the exact bytes Stripe sent. `await req.text()` before any
 * parsing is not a style choice: `req.json()` would re-serialise, the bytes would
 * differ, and every delivery would fail verification. This is the single most
 * common way a Stripe integration is quietly broken in a framework that parses
 * bodies eagerly.
 *
 * ## Failures must be loud
 *
 * A handler that cannot write returns 500 so Stripe retries. Swallowing that error
 * with a 200 would leave somebody who has been charged sitting on the free plan
 * with no second delivery coming — the worst failure this app can have.
 */
import { NextResponse } from 'next/server';
import type Stripe from 'stripe';
import { applySubscription, billingConfigured, firstDelivery, stripe } from '@/lib/billing';
import { serviceConfigured } from '@/lib/supabase/admin';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/** Events this route acts on. Anything else is acknowledged and ignored. */
const HANDLED = new Set([
  'checkout.session.completed',
  'customer.subscription.created',
  'customer.subscription.updated',
  'customer.subscription.deleted',
]);

export async function POST(req: Request) {
  const secret = process.env.STRIPE_WEBHOOK_SECRET?.trim();
  if (!secret || !billingConfigured()) {
    return NextResponse.json(
      { error: 'STRIPE_WEBHOOK_SECRET is not configured.' },
      { status: 503 },
    );
  }

  const signature = req.headers.get('stripe-signature');
  if (!signature) {
    return NextResponse.json({ error: 'Missing stripe-signature.' }, { status: 400 });
  }

  // Raw bytes first, always. See the note above.
  const raw = await req.text();

  let event: Stripe.Event;
  try {
    event = stripe().webhooks.constructEvent(raw, signature, secret);
  } catch (err) {
    // A bad signature is either a misconfigured secret or somebody probing. Both
    // get 400 and no detail.
    console.error('[stripe] signature check failed:', err instanceof Error ? err.message : err);
    return NextResponse.json({ error: 'Invalid signature.' }, { status: 400 });
  }

  if (!HANDLED.has(event.type)) {
    // Acknowledged so Stripe stops retrying an event we never asked for.
    return NextResponse.json({ ignored: event.type });
  }

  if (!serviceConfigured()) {
    // Non-2xx on purpose: Stripe will retry, and by then the deployment may have
    // its service role. Acknowledging would drop a paid upgrade permanently.
    return NextResponse.json(
      { error: 'Supabase service role is not configured.' },
      { status: 503 },
    );
  }

  if (!(await firstDelivery(event))) {
    return NextResponse.json({ duplicate: event.id });
  }

  try {
    switch (event.type) {
      /*
       * The checkout finished. The session carries a subscription id but not the
       * subscription, so it is fetched: the price on the line item is what decides
       * the plan, and taking it from Stripe rather than from the session's metadata
       * means a tampered checkout cannot name a plan it did not pay for.
       */
      case 'checkout.session.completed': {
        const session = event.data.object;
        const id =
          typeof session.subscription === 'string'
            ? session.subscription
            : session.subscription?.id;
        if (!id) break;
        await applySubscription(await stripe().subscriptions.retrieve(id));
        break;
      }

      // Created, changed plan, renewed, lapsed, or cancelled. One handler, because
      // the desired end state is the same in every case: whatever Stripe says now.
      case 'customer.subscription.created':
      case 'customer.subscription.updated':
      case 'customer.subscription.deleted': {
        await applySubscription(event.data.object);
        break;
      }
    }
  } catch (err) {
    console.error('[stripe] handler failed:', err instanceof Error ? err.message : err);
    return NextResponse.json({ error: 'Handler failed.' }, { status: 500 });
  }

  return NextResponse.json({ ok: true, type: event.type });
}
