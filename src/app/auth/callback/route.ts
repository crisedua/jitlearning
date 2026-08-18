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
    /*
     * The reason goes to the log, a code goes in the URL.
     *
     * This forwarded the provider's own string as `?error=`, which /acceso then
     * used as a lookup key. No entry matches a sentence from Google, so the
     * learner saw the generic message — correct — while the raw text rode along
     * in their address bar, and the server kept no record of it at all.
     *
     * So the one failure nobody can afford to have be mysterious was also the
     * one nobody could diagnose: the learner has the detail and cannot use it,
     * the operator can use it and does not have it.
     */
    console.error('[auth] provider declined:', providerError);
    return NextResponse.redirect(`${origin}/acceso?error=access_denied`);
  }

  if (!code) {
    return NextResponse.redirect(`${origin}/acceso?error=missing_code`);
  }

  const supabase = await createClient();
  const { data, error } = await supabase.auth.exchangeCodeForSession(code);
  if (error) {
    /*
     * Logged for the same reason, and this is the branch that matters most.
     * A code delivered to an origin other than the one the flow began on cannot
     * be exchanged, because the PKCE verifier is a cookie bound to that origin —
     * which is exactly what a second hostname produces, and what the canonical
     * redirect in the middleware exists to prevent. Without this line that
     * failure is invisible from the server side.
     */
    console.error('[auth] code exchange failed:', error.message);
    return NextResponse.redirect(`${origin}/acceso?error=exchange_failed`);
  }

  // Mirror the Google identity into `public.profiles`. Best-effort: the sign-in
  // has already succeeded, and refusing to let someone in because a profile
  // write failed would be the wrong trade.
  if (data.user) await syncProfile(data.user);

  return NextResponse.redirect(`${origin}${next}`);
}
