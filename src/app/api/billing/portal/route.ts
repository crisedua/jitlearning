/**
 * The billing portal.
 *
 * Stripe's hosted page for changing a card, downloading invoices and cancelling.
 * This route exists because the alternative is "email us to cancel", which is
 * both a support burden and, in most of the places this is sold, not lawful.
 *
 * Nothing about the subscription is edited here. The portal makes the change and
 * the webhook applies it, which is the same rule the checkout follows.
 */
import { NextResponse } from 'next/server';
import { billingConfigured, customerIdFor, stripe } from '@/lib/billing';
import { currentUser } from '@/lib/supabase/server';
import { siteOrigin } from '@/lib/origin';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function POST() {
  const user = await currentUser();
  if (!user) {
    return NextResponse.json({ error: 'Inicia sesión para ver tu suscripción.' }, { status: 401 });
  }

  if (!billingConfigured()) {
    return NextResponse.json(
      { error: 'Los pagos todavía no están habilitados en este despliegue.' },
      { status: 503 },
    );
  }

  // Never subscribed, so there is nothing to manage. A 404 rather than an empty
  // portal, so the UI can offer the pricing page instead of a dead end.
  const customer = await customerIdFor(user.id);
  if (!customer) {
    return NextResponse.json({ error: 'Todavía no tienes una suscripción.' }, { status: 404 });
  }

  try {
    const session = await stripe().billingPortal.sessions.create({
      customer,
      return_url: `${await siteOrigin()}/progreso`,
    });

    return NextResponse.json({ url: session.url });
  } catch (err) {
    console.error('[portal] failed:', err instanceof Error ? err.message : err);
    return NextResponse.json(
      { error: 'No pudimos abrir la administración de tu plan.' },
      { status: 502 },
    );
  }
}
