/**
 * Create the Stripe prices for every paid plan, from the deployed app.
 *
 *   curl -X POST https://<app>.vercel.app/api/billing/setup \
 *     -H "x-ingest-secret: $INGEST_SECRET"
 *
 * This exists for the same reason `/api/agent/provision` does: the keys live in
 * Vercel's environment, so nothing has to be copied onto anybody's laptop. It is
 * also the step most likely to be done wrong by hand, because it is the one place
 * two systems have to agree on a number.
 *
 * ## It closes the price gap rather than documenting it
 *
 * `plans.price_minor` is what the pricing page quotes; the Stripe price is what
 * the card is charged. Creating the price here, *from* `price_minor`, is what makes
 * those the same number instead of two records of the same fact that drift. Doing
 * it in the dashboard means typing the amount a second time.
 *
 * ## Idempotent, and it will not repoint a live price
 *
 * A plan that already has `stripe_price_id` is skipped. Stripe prices are
 * immutable by design: changing what a subscriber pays means creating a new price
 * and migrating subscriptions, which is a decision with billing consequences and
 * not something a setup endpoint should do because it was called twice. Use
 * `?force=true` to create an additional price for a plan that has one, and expect
 * to migrate existing subscribers yourself.
 */
import { NextResponse } from 'next/server';
import { billingConfigured, stripe } from '@/lib/billing';
import { requireSecret, UnauthorizedError } from '@/lib/auth';
import { serviceConfigured, supabaseAdmin } from '@/lib/supabase/admin';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const maxDuration = 60;

/**
 * Whether the quoted price already contains the tax.
 *
 * ## This has to be set, or nothing can be bought
 *
 * A price created without `tax_behavior` is `unspecified`, and Stripe refuses to
 * put an `unspecified` price into a Checkout Session with automatic tax on.
 * `/api/checkout` turns automatic tax on for every session, so a price created
 * without this line cannot be sold at all: the pay button opens nothing and the
 * failure is a hundred lines away in a different command. Prices are otherwise
 * immutable, though `tax_behavior` may be set exactly once afterwards, which is
 * the only reason this is recoverable without new prices.
 *
 * ## Why inclusive, and what it costs
 *
 * `docs/pricing.md` says a CLP list price is normally quoted with IVA included,
 * and that the margin figures in its §3 are pre-tax. Both cannot hold at once,
 * so this is a commercial decision and not a technical one:
 *
 *   inclusive   the learner is charged the number on the pricing page, and the
 *               19% comes out of it, so Chilean revenue lands ~16% under §3
 *   exclusive   §3's margins hold, and a page quoting US$9 charges US$10.71 at
 *               the last screen before payment
 *
 * Inclusive, because this product's whole argument is that its numbers are
 * honest, and a price that grows at the checkout screen breaks that at the worst
 * possible moment. It is one word to change here if the margin matters more,
 * and it only binds prices created from this point on.
 */
const TAX_BEHAVIOUR = 'inclusive' as const;

interface PlanRow {
  id: string;
  name: string;
  price_minor: number;
  currency: string;
  blurb: string | null;
  stripe_price_id: string | null;
}

export async function POST(req: Request) {
  try {
    requireSecret(req);
  } catch (err) {
    if (err instanceof UnauthorizedError) {
      return NextResponse.json({ error: err.message }, { status: err.status });
    }
    throw err;
  }

  if (!billingConfigured()) {
    return NextResponse.json({ error: 'STRIPE_SECRET_KEY is not set.' }, { status: 503 });
  }
  if (!serviceConfigured()) {
    return NextResponse.json({ error: 'SUPABASE_SERVICE_ROLE_KEY is not set.' }, { status: 503 });
  }

  const force = new URL(req.url).searchParams.get('force') === 'true';

  const { data, error } = await supabaseAdmin()
    .from('plans')
    .select('id, name, price_minor, currency, blurb, stripe_price_id')
    .eq('is_public', true)
    .gt('price_minor', 0)
    .order('sort_order');

  if (error) {
    return NextResponse.json(
      { error: `Could not read plans: ${error.message}` },
      { status: 500 },
    );
  }

  const plans = (data ?? []) as PlanRow[];
  const results: Array<Record<string, unknown>> = [];

  for (const plan of plans) {
    if (plan.stripe_price_id && !force) {
      results.push({ plan: plan.id, skipped: 'already has a price', priceId: plan.stripe_price_id });
      continue;
    }

    try {
      /*
       * The amount, in the units Stripe expects.
       *
       * `price_minor` is minor units for USD (cents) and whole units for the
       * currencies that have none, which is exactly Stripe's own convention. So
       * this is a pass-through, stated explicitly because a stray multiplication
       * here would charge a hundred times the intended amount and nothing
       * downstream would catch it.
       */
      const unitAmount = plan.price_minor;
      const currency = plan.currency.toLowerCase();

      const price = await stripe().prices.create({
        currency,
        unit_amount: unitAmount,
        recurring: { interval: 'month' },
        // Not optional. See the note on TAX_BEHAVIOUR: without it the price
        // cannot be put into a checkout session at all.
        tax_behavior: TAX_BEHAVIOUR,
        product_data: {
          name: `ModoJIT ${plan.name}`,
          metadata: { plan_id: plan.id },
        },
        metadata: { plan_id: plan.id },
      });

      const update = await supabaseAdmin()
        .from('plans')
        .update({ stripe_price_id: price.id })
        .eq('id', plan.id);

      if (update.error) {
        /*
         * The price exists in Stripe but the id did not land here. Reported as a
         * failure with the id included, because the fix is one SQL statement and
         * the alternative is an orphaned price nobody can find.
         */
        results.push({
          plan: plan.id,
          error: `Price ${price.id} created but not saved: ${update.error.message}`,
          fix: `update public.plans set stripe_price_id = '${price.id}' where id = '${plan.id}';`,
        });
        continue;
      }

      results.push({ plan: plan.id, created: price.id, amount: unitAmount, currency });
    } catch (err) {
      results.push({
        plan: plan.id,
        error: err instanceof Error ? err.message : 'Stripe rejected the price',
      });
    }
  }

  const failed = results.filter((r) => 'error' in r).length;

  return NextResponse.json(
    {
      ok: failed === 0,
      plans: results,
      next:
        failed === 0
          ? 'Subscribe the webhook to checkout.session.completed and the three customer.subscription events, then run npm run doctor.'
          : 'Fix the errors above and call this again; plans that succeeded are skipped.',
    },
    { status: failed === 0 ? 200 : 500 },
  );
}
