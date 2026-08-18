/**
 * A click on a buy button, recorded.
 *
 * While checkout is unconfigured, /planes offers a prefilled email or WhatsApp
 * message. Somebody who clicks it has decided to pay; whether they then send the
 * message, and whether it is seen, is out of the product's hands. This route is
 * the one part that is not: it records that the moment happened, so the funnel
 * can show attempts rather than stopping at the step before them.
 *
 * ## Why this one is open when every other write is not
 *
 * `/api/ask` and the ingest routes carry INGEST_SECRET, and /api/pain-search was
 * just closed for having no reader. This is a public write, which is the thing
 * that usually deserves the most suspicion, so the trade is worth stating.
 *
 * A pricing page is public and most of the people on it are signed out. A gate
 * here would only record intents from people who already have accounts, which
 * is the population whose interest you can already see, and would silently drop
 * the strangers, who are the ones worth learning about.
 *
 * What makes it safe to leave open is the shape of the row rather than the door:
 * a plan id checked against the plans that actually exist, a channel checked
 * against two literals, and a user id the browser cannot influence because it is
 * read from the session cookie here. There is no free-text column, so the worst
 * a determined stranger can do is inflate a count on an admin page. That is a
 * real cost and it is smaller than not knowing whether anybody wants to buy.
 *
 * ## Fire and forget, on purpose
 *
 * The client sends this with `sendBeacon` and does not wait. A person clicking
 * "Conversemos" is on their way to a mail client; making that wait on a database
 * write, or fail with them, would be trading the sale for the measurement.
 */
import { NextResponse } from 'next/server';
import { z } from 'zod';
import { currentUser } from '@/lib/supabase/server';
import { serviceConfigured, supabaseAdmin } from '@/lib/supabase/admin';
import { FALLBACK_PLANS } from '@/lib/plans';

export const runtime = 'nodejs';

/**
 * Plan ids are validated against the compiled list rather than a database read.
 * The check exists to keep arbitrary strings out of the column, and a round trip
 * to Postgres to learn what this file already knows would add latency to a
 * request whose whole point is not to delay anybody.
 */
const KNOWN_PLANS = new Set(FALLBACK_PLANS.map((p) => p.id));

const Body = z.object({
  plan: z.string().max(40).refine((id) => KNOWN_PLANS.has(id), 'unknown plan'),
  channel: z.enum(['email', 'whatsapp']),
});

export async function POST(req: Request) {
  if (!serviceConfigured()) {
    // 204 rather than 503: nothing the caller can do, and the caller is a
    // beacon from a page whose real job is elsewhere.
    return new NextResponse(null, { status: 204 });
  }

  let raw: unknown;
  try {
    raw = await req.json();
  } catch {
    return NextResponse.json({ error: 'Invalid JSON body.' }, { status: 400 });
  }

  const parsed = Body.safeParse(raw);
  if (!parsed.success) {
    return NextResponse.json({ error: 'Invalid intent.' }, { status: 400 });
  }

  // From the cookie, never from the body. A browser can claim a plan; it cannot
  // claim to be somebody else.
  const user = await currentUser().catch(() => null);

  const { error } = await supabaseAdmin()
    .from('purchase_intents')
    .insert({
      user_id: user?.id ?? null,
      plan_id: parsed.data.plan,
      channel: parsed.data.channel,
    });

  if (error) {
    // Logged, not surfaced. The person is already navigating to their mail
    // client and a failed measurement must not become a failed sale.
    console.error('[intent] insert failed:', error.message);
    return new NextResponse(null, { status: 204 });
  }

  return new NextResponse(null, { status: 204 });
}
