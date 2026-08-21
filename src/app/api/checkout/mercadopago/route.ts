/**
 * Start a Mercado Pago checkout.
 *
 * Mints a subscription in `pending` and hands back the URL where the learner
 * approves it. That is all it does: it does not change the plan, and it must
 * not. The plan changes when the webhook says Mercado Pago authorised the
 * subscription, because anything else is a paywall that can be walked through
 * by closing the tab at the right moment.
 *
 * The Stripe twin of this route is `/api/checkout`. Both exist; neither knows
 * about the other. A learner pays through whichever rail suits them and ends up
 * with the same `plan_id`.
 */
import { NextResponse, type NextRequest } from 'next/server';
import { createPreapproval, mpConfigured, mpPurchasablePlan } from '@/lib/mercadopago';
import { currentUser } from '@/lib/supabase/server';
import { siteOrigin } from '@/lib/origin';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function POST(request: NextRequest) {
  const user = await currentUser();
  if (!user) {
    return NextResponse.json({ error: 'Inicia sesión para elegir un plan.' }, { status: 401 });
  }

  /*
   * Mercado Pago needs an address to bill, and the session is the only place
   * this app has one it did not ask a form for. A Google sign-in without an
   * email is not a case that occurs, but it is a case that would otherwise
   * reach the platform as an unreadable 400.
   */
  if (!user.email) {
    return NextResponse.json(
      { error: 'Tu cuenta no tiene un correo con el que cobrar.' },
      { status: 400 },
    );
  }

  if (!mpConfigured()) {
    return NextResponse.json(
      { error: 'Los pagos con Mercado Pago todavía no están habilitados en este despliegue.' },
      { status: 503 },
    );
  }

  const body = (await request.json().catch(() => ({}))) as { plan?: string };
  const plan = await mpPurchasablePlan((body.plan ?? '').trim());
  if (!plan) {
    return NextResponse.json(
      { error: 'Ese plan no se puede pagar con Mercado Pago todavía.' },
      { status: 400 },
    );
  }

  try {
    const preapproval = await createPreapproval({
      userId: user.id,
      email: user.email,
      planId: plan.id,
      planName: `ModoJIT ${plan.name}`,
      amountClp: plan.amountClp,
      backUrl: `${await siteOrigin()}/progreso`,
    });

    if (!preapproval.init_point) {
      throw new Error('Mercado Pago returned no init_point');
    }

    return NextResponse.json({ url: preapproval.init_point });
  } catch (err) {
    /*
     * The reason goes to the logs and never to the learner. A platform error
     * names fields, amounts and sometimes the account, none of which helps
     * somebody who wanted to pay and all of which is ours to read.
     */
    console.error('[checkout] mercadopago:', (err as Error).message);
    return NextResponse.json(
      { error: 'No pudimos abrir el pago. Intenta de nuevo en un momento.' },
      { status: 502 },
    );
  }
}
