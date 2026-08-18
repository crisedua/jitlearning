/**
 * Start a checkout.
 *
 * Mints a Stripe Checkout Session and hands back its URL. That is all it does:
 * it does not change the learner's plan, and it must not. The plan changes when
 * the webhook confirms Stripe took the money, because anything else is a paywall
 * that can be walked through by closing the tab at the right moment.
 *
 * Behind the learner's Google session, like `/api/signed-url`, because the
 * session is what identifies whose subscription this becomes.
 */
import { NextResponse, type NextRequest } from 'next/server';
import { billingConfigured, customerFor, purchasablePlan, stripe } from '@/lib/billing';
import { currentUser } from '@/lib/supabase/server';
import { siteOrigin } from '@/lib/origin';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function POST(request: NextRequest) {
  const user = await currentUser();
  if (!user) {
    return NextResponse.json(
      { error: 'Inicia sesión para elegir un plan.' },
      { status: 401 },
    );
  }

  if (!billingConfigured()) {
    return NextResponse.json(
      { error: 'Los pagos todavía no están habilitados en este despliegue.' },
      { status: 503 },
    );
  }

  const body = (await request.json().catch(() => ({}))) as { plan?: string };
  const requested = (body.plan ?? '').trim();

  /*
   * The price comes from the database, never from the request.
   *
   * The browser sends a plan id and this resolves it to a Stripe price itself, so
   * the worst a tampered request can do is name a different plan we sell at that
   * plan's real price. A request that carried its own amount would be a request
   * that could set it to zero.
   */
  const plan = await purchasablePlan(requested);
  if (!plan) {
    return NextResponse.json(
      { error: 'Ese plan no se puede contratar todavía.' },
      { status: 400 },
    );
  }

  try {
    const origin = await siteOrigin();
    const customer = await customerFor(user.id, user.email);

    const session = await stripe().checkout.sessions.create({
      mode: 'subscription',
      customer,
      line_items: [{ price: plan.priceId, quantity: 1 }],
      // Both are belt and braces for attribution: the webhook resolves the learner
      // by customer id, and these make a payment traceable to a user in the Stripe
      // dashboard by someone who has never read this code.
      client_reference_id: user.id,
      subscription_data: { metadata: { user_id: user.id, plan_id: plan.id } },
      allow_promotion_codes: true,
      /*
       * Chile bills IVA on digital services, and getting that wrong is the kind of
       * mistake that surfaces a year later. Stripe Tax computes it per country.
       *
       * `customer_update` is not optional decoration next to it. Stripe refuses to
       * create a session with automatic tax against an existing customer that has
       * no address, and `customerFor` creates customers with an email and nothing
       * else, so without this line every checkout for every new customer fails at
       * `sessions.create`, gets caught below, and returns "No pudimos abrir el
       * pago." The learner sees a payment that will not open, retries, sees it
       * again, and leaves. `auto` lets Checkout collect the address and save it
       * back, which is also what makes the tax calculation right.
       */
      automatic_tax: { enabled: true },
      customer_update: { address: 'auto' },
      /*
       * The success page says the plan may take a moment, because it can: the
       * redirect and the webhook race, and the redirect usually wins. Promising
       * an already-upgraded account here is how a product looks broken at the
       * exact moment somebody has just paid.
       */
      /*
       * Back to the notebook on success, to the prices on a change of mind.
       *
       * `/progreso` reads `pago=listo` and says the plan takes a moment,
       * because Stripe redirects the moment the card clears and the plan is
       * applied by the webhook after. Without that sentence somebody who has
       * just paid lands on a page still describing them as free.
       *
       * `/planes` reads nothing, and that is deliberate rather than missing.
       * Somebody who backed out of a checkout does not need to be told they
       * backed out, and the page revalidates: reading a search parameter there
       * would opt it out of static rendering and put a Postgres query on every
       * view of the public price list, which is exactly what `loadPlans` was
       * written to avoid. The parameter stays because it costs nothing and says
       * in a log which returns were abandoned.
       */
      success_url: `${origin}/progreso?pago=listo`,
      cancel_url: `${origin}/planes?pago=cancelado`,
    });

    if (!session.url) {
      return NextResponse.json({ error: 'Stripe no devolvió una URL de pago.' }, { status: 502 });
    }

    return NextResponse.json({ url: session.url });
  } catch (err) {
    console.error('[checkout] failed:', err instanceof Error ? err.message : err);
    return NextResponse.json(
      { error: 'No pudimos abrir el pago. Intenta de nuevo en un momento.' },
      { status: 502 },
    );
  }
}
