/**
 * Where Mercado Pago says a subscription changed.
 *
 * The only thing that moves `plan_id` for a learner who paid through Mercado
 * Pago. The checkout route mints a subscription and sends them off to approve
 * it; until a notification arrives here saying it is authorised, nobody has
 * bought anything.
 *
 * ## Setting it up
 *
 *   Mercado Pago → Tus integraciones → tu aplicación → Webhooks
 *   URL:    https://<this deployment>/api/webhooks/mercadopago
 *   Events: Suscripciones (subscription_preapproval)
 *   Copy the signing secret into MP_WEBHOOK_SECRET.
 *
 * Without that secret every delivery is refused, which is the safe direction and
 * the one this deployment has already been burned by in the other order: a
 * missing `ELEVENLABS_WEBHOOK_SECRET` had the transcript webhook answering 503
 * for days while every health check stayed green. `/api/health` names this one
 * for the same reason.
 *
 * ## Why there is no event claim
 *
 * The Stripe twin claims each event id in `billing_events` before handling it,
 * because a redelivered Stripe event could apply something twice. There is
 * nothing here that is unsafe to repeat: the handler reads the subscription's
 * current state from Mercado Pago and writes the plan that state implies, so
 * running it five times leaves exactly what running it once leaves. A claim
 * table would add a row, a migration and a failure mode for no gain.
 */
import { NextResponse, type NextRequest } from 'next/server';
import {
  applyPreapproval,
  fetchPreapproval,
  mpConfigured,
  verifySignature,
} from '@/lib/mercadopago';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function POST(request: NextRequest) {
  const secret = process.env.MP_WEBHOOK_SECRET?.trim();
  if (!secret || !mpConfigured()) {
    return NextResponse.json(
      { error: 'Mercado Pago is not configured in this deployment.' },
      { status: 503 },
    );
  }

  const rawBody = await request.text();

  let payload: { type?: string; action?: string; data?: { id?: string } };
  try {
    payload = JSON.parse(rawBody) as typeof payload;
  } catch {
    return NextResponse.json({ error: 'Body is not JSON.' }, { status: 400 });
  }

  /*
   * The id the signature covers comes from the query string.
   *
   * Mercado Pago signs `data.id` as it appears in the notification URL, and
   * sends the same value in the body. Reading the query first and falling back
   * keeps the check working whichever way a given notification is shaped.
   */
  const dataId = request.nextUrl.searchParams.get('data.id') ?? payload.data?.id ?? null;

  if (!verifySignature(
    request.headers.get('x-signature'),
    request.headers.get('x-request-id'),
    dataId,
    secret,
  )) {
    return NextResponse.json({ error: 'Invalid signature.' }, { status: 401 });
  }

  /*
   * Mercado Pago sends payment notifications on the same hook. Accepted with a
   * 200 so it stops retrying, and ignored: a plan follows the subscription's
   * state, and an individual charge does not change it.
   */
  if (payload.type && payload.type !== 'subscription_preapproval') {
    return NextResponse.json({ ignored: payload.type });
  }

  if (!dataId) {
    return NextResponse.json({ error: 'No data.id in notification.' }, { status: 400 });
  }

  try {
    /*
     * Fetched, never taken from the body.
     *
     * The notification says something changed; it does not say what the
     * subscription now is. Trusting a status off the wire would mean a forged
     * body — or a stale redelivery arriving after a cancellation — could set a
     * plan that the platform does not agree with.
     */
    const preapproval = await fetchPreapproval(dataId);
    const planId =
      (preapproval as { metadata?: { plan_id?: string } }).metadata?.plan_id ?? null;

    await applyPreapproval(preapproval, planId);
  } catch (err) {
    /*
     * 500 on purpose, so Mercado Pago retries. The alternative is a learner who
     * paid and stayed on the free plan with a green tick in the dashboard.
     */
    console.error('[webhook] mercadopago:', (err as Error).message);
    return NextResponse.json({ error: 'Handler failed.' }, { status: 500 });
  }

  return NextResponse.json({ ok: true });
}
