/**
 * Where Google sends the learner back, by way of Supabase.
 *
 * Supabase handles the provider handshake at
 * `https://<project>.supabase.co/auth/v1/callback` and then redirects here with
 * a one-time code. Exchanging it is what writes the session cookies, so this
 * route is the moment someone becomes signed in.
 */
import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { safeReturnPath } from '@/lib/paths';
import { siteOrigin } from '@/lib/origin';
import { syncProfile } from '@/lib/account';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  // The forwarded host, not `request.url`'s origin: behind a proxy those can
  // differ, and redirecting to the wrong one lands the learner on a domain that
  // does not hold the session cookie this request just set.
  const origin = await siteOrigin();
  const code = searchParams.get('code');
  const next = safeReturnPath(searchParams.get('next'));

  // The provider declined, or the learner did. Supabase forwards its reason;
  // /acceso turns the code into something a person can act on.
  const providerError = searchParams.get('error_description') ?? searchParams.get('error');
  if (providerError) {
    return NextResponse.redirect(
      `${origin}/acceso?error=${encodeURIComponent(providerError)}`,
    );
  }

  if (!code) {
    return NextResponse.redirect(`${origin}/acceso?error=missing_code`);
  }

  const supabase = await createClient();
  const { data, error } = await supabase.auth.exchangeCodeForSession(code);
  if (error) {
    return NextResponse.redirect(`${origin}/acceso?error=${encodeURIComponent(error.message)}`);
  }

  // Mirror the Google identity into `public.profiles`. Best-effort: the sign-in
  // has already succeeded, and refusing to let someone in because a profile
  // write failed would be the wrong trade.
  if (data.user) await syncProfile(data.user);

  return NextResponse.redirect(`${origin}${next}`);
}
