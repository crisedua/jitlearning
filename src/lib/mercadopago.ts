/**
 * Taking money through Mercado Pago, for the market this product is sold in.
 *
 * `billing.ts` explains why Stripe: the plans are priced in USD and hosted
 * Checkout keeps card data off this app entirely. Both are still true and
 * neither helps a person in Santiago, where the card most people reach for is
 * one Stripe reaches badly and where the balance in a Mercado Pago account is
 * itself a payment method.
 *
 * ## The rule is the same rule
 *
 * **`plan_id` is never set by the browser.** The checkout route mints a
 * subscription and hands back a URL; the plan changes when Mercado Pago's
 * webhook says the subscription is authorised. Anything else is a paywall that
 * can be walked through by closing the tab at the right moment.
 *
 * ## Why there is no customer table
 *
 * Stripe puts a customer between a person and their subscription, so
 * `billing.ts` has to keep `stripe_customer_id` on the profile and look the
 * profile back up by it. Mercado Pago carries an `external_reference` on the
 * subscription, which this sets to the learner's id — so the webhook reads the
 * id off the subscription and updates that profile directly. One less join, and
 * one less way for a payment to land on nobody.
 *
 * ## What is deliberately not here
 *
 * No proration, no coupons, no invoices, no dunning. Mercado Pago notifies the
 * payer about failed charges and lets them cancel from their own account, which
 * is better than anything this file could offer.
 */
import { createHmac, timingSafeEqual } from 'node:crypto';
import { serviceConfigured, supabaseAdmin } from './supabase/admin';

const API = 'https://api.mercadopago.com';

/**
 * Subscription states that mean "this person is paying".
 *
 * Only `authorized`. Mercado Pago's `pending` is a subscription that was minted
 * and never approved — the tab-closing case — and `paused` and `cancelled` are
 * both people who have stopped. Unlike Stripe there is no `past_due` to be
 * generous about: a failed charge leaves the subscription authorised and
 * Mercado Pago retries it on its own, so somebody mid-dunning keeps their plan
 * without this file needing an opinion about it.
 */
const PAYING = new Set(['authorized']);

export function mpConfigured(): boolean {
  return Boolean(process.env.MP_ACCESS_TOKEN?.trim());
}

/**
 * Whether a notification really came from Mercado Pago.
 *
 * Pure, and separated from the route so it can be tested against a signature
 * built by hand — which is the only way to find out that this agrees with the
 * platform before a real payment depends on it.
 *
 * The scheme: `x-signature` carries `ts` and `v1`, and `v1` is an HMAC-SHA256
 * over `id:<data.id>;request-id:<x-request-id>;ts:<ts>;` keyed with the secret
 * from the webhook's configuration. The id is lowercased, and any component
 * whose value is absent is left out of the manifest entirely rather than
 * included as an empty string.
 */
export function verifySignature(
  header: string | null,
  requestId: string | null,
  dataId: string | null,
  secret: string,
): boolean {
  if (!header || !secret) return false;

  const parts = new Map<string, string>();
  for (const piece of header.split(',')) {
    const [k, v] = piece.split('=');
    if (k && v) parts.set(k.trim(), v.trim());
  }

  const ts = parts.get('ts');
  const provided = parts.get('v1');
  if (!ts || !provided) return false;

  /*
   * Built by appending only what exists.
   *
   * A missing `x-request-id` must drop `request-id:;` from the manifest rather
   * than leave it empty — the two produce different hashes, and the empty one
   * rejects every notification that arrives without the header.
   */
  let manifest = '';
  if (dataId) manifest += `id:${dataId.toLowerCase()};`;
  if (requestId) manifest += `request-id:${requestId};`;
  manifest += `ts:${ts};`;

  const expected = createHmac('sha256', secret).update(manifest).digest('hex');
  const a = Buffer.from(expected, 'utf8');
  const b = Buffer.from(provided, 'utf8');
  return a.length === b.length && timingSafeEqual(a, b);
}

/**
 * Which plan a subscription state entitles somebody to.
 *
 * Pulled out for the same reason `planFor` is in `billing.ts`: it decides
 * whether somebody who paid gets what they paid for, and that decision should
 * be testable without a database or a payment.
 *
 * Anything that is not paying returns `free`, never null. `plan_id` is a
 * non-null foreign key that the gate reads on every mint, so "no plan" is not a
 * state this schema can hold, and `free` is the honest meaning: the history
 * stays, the minutes stop.
 */
export function planForStatus(status: string, planId: string | null): string {
  if (!PAYING.has(status)) return 'free';
  return planId ?? 'free';
}

/**
 * The plan somebody is allowed to buy here, at the price we set.
 *
 * The mirror of `purchasablePlan` in `billing.ts`, and it exists for the same
 * reason: the browser sends a plan id and the amount is looked up, never sent.
 * A request that carried its own amount would be a request that could set it to
 * zero.
 *
 * A null `mp_price_minor` refuses the sale rather than converting the USD price
 * at some rate. That is the state every plan is in until somebody sets a peso
 * price by hand, and refusing is the right answer: a checkout that invents an
 * amount is a checkout that charges a number nobody chose.
 */
export async function mpPurchasablePlan(
  planId: string,
): Promise<{ id: string; name: string; amountClp: number } | null> {
  if (!serviceConfigured()) return null;

  const { data, error } = await supabaseAdmin()
    .from('plans')
    .select('id, name, is_public, mp_price_minor')
    .eq('id', planId)
    .maybeSingle();

  if (error || !data) return null;
  const row = data as {
    id: string;
    name: string;
    is_public: boolean;
    mp_price_minor: number | null;
  };

  if (!row.is_public || !row.mp_price_minor || row.mp_price_minor <= 0) return null;
  return { id: row.id, name: row.name, amountClp: row.mp_price_minor };
}

async function mp<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(`${API}${path}`, {
    ...init,
    headers: {
      Authorization: `Bearer ${process.env.MP_ACCESS_TOKEN?.trim()}`,
      'Content-Type': 'application/json',
      ...(init?.headers ?? {}),
    },
  });

  if (!res.ok) {
    /*
     * The body, not just the status. Mercado Pago answers a rejected
     * subscription with a 400 and a message naming the field, and losing it
     * turns every integration mistake into the same unreadable "400".
     */
    const detail = await res.text().catch(() => '');
    throw new Error(`Mercado Pago ${res.status}: ${detail.slice(0, 300)}`);
  }

  return (await res.json()) as T;
}

export interface Preapproval {
  id: string;
  status: string;
  /** The learner's id, set at creation. This is how a payment finds its person. */
  external_reference?: string | null;
  init_point?: string;
  next_payment_date?: string | null;
}

/**
 * Mint a subscription and return where to send the learner to authorise it.
 *
 * `status: 'pending'` because the payer has not approved anything yet: they
 * approve it on Mercado Pago's page, and the webhook that follows is what moves
 * it to `authorized`. Creating it as authorised would be this app asserting a
 * payment it has not seen.
 */
export async function createPreapproval(args: {
  userId: string;
  email: string;
  planId: string;
  planName: string;
  amountClp: number;
  backUrl: string;
}): Promise<Preapproval> {
  return mp<Preapproval>('/preapproval', {
    method: 'POST',
    body: JSON.stringify({
      reason: args.planName,
      external_reference: args.userId,
      payer_email: args.email,
      back_url: args.backUrl,
      status: 'pending',
      auto_recurring: {
        frequency: 1,
        frequency_type: 'months',
        transaction_amount: args.amountClp,
        currency_id: 'CLP',
      },
      // Read back by the webhook so the profile lands on the right plan without
      // a second lookup against the plans table.
      metadata: { plan_id: args.planId },
    }),
  });
}

/** The platform's copy of a subscription, which is the only one to trust. */
export async function fetchPreapproval(id: string): Promise<Preapproval> {
  return mp<Preapproval>(`/preapproval/${encodeURIComponent(id)}`);
}

/**
 * Write the plan a subscription entitles somebody to.
 *
 * Throws on every failure, including the one that is not an error.
 *
 * An update whose filter matches nothing is a success in Postgres and in
 * PostgREST: no error, no rows. `billing.ts` learned this the expensive way —
 * somebody paid, the write matched no profile, the route answered 200, and the
 * provider never retried. So a zero count throws here too, which makes the
 * delivery fail and retry, and if it keeps failing it surfaces as a visible
 * failed webhook. An operator who can see a problem beats a customer who
 * quietly got nothing.
 */
export async function applyPreapproval(
  preapproval: Preapproval,
  planId: string | null,
): Promise<void> {
  if (!serviceConfigured()) return;

  const userId = preapproval.external_reference?.trim();
  if (!userId) {
    throw new Error(`Preapproval ${preapproval.id} carries no external_reference`);
  }

  const { error, count } = await supabaseAdmin()
    .from('profiles')
    .update(
      {
        plan_id: planForStatus(preapproval.status, planId),
        mp_preapproval_id: preapproval.id,
        subscription_status: preapproval.status,
        subscription_ends_at: preapproval.next_payment_date ?? null,
        updated_at: new Date().toISOString(),
      },
      { count: 'exact' },
    )
    .eq('id', userId);

  if (error) {
    console.error('[mercadopago] could not apply subscription:', error.message);
    throw new Error(error.message);
  }

  if (count === 0) {
    console.error(`[mercadopago] no profile ${userId} for preapproval ${preapproval.id}`);
    throw new Error(`No profile for ${userId}`);
  }
}
