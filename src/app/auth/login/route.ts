/**
 * Starts the Google handshake. The single entry point into sign-in.
 *
 * A link, not a form, because the learner reaches it by clicking "Hablar con el
 * coach" — there is no interstitial page asking them to click a second button.
 * That is safe here: this route only *begins* an OAuth flow, and the code that
 * comes back is worthless without the PKCE verifier this request puts in a
 * cookie. Nothing is granted until `/auth/callback` sees both.
 *
 * It has to be a route handler rather than a page: `signInWithOAuth` writes
 * that verifier cookie, and Server Components cannot set cookies.
 */
import { NextResponse } from 'next/server';
import { createClient, authConfigured } from '@/lib/supabase/server';
import { siteOrigin } from '@/lib/origin';
import { safeReturnPath } from '@/lib/paths';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const next = safeReturnPath(searchParams.get('next'));
  const origin = await siteOrigin();

  // Nothing to hand off to. /acceso says so in the learner's language instead
  // of bouncing them to a Google error page about a missing client id.
  if (!authConfigured()) {
    return NextResponse.redirect(`${origin}/acceso?error=unconfigured`);
  }

  const supabase = await createClient();

  // Already signed in — a second trip through Google would only re-prompt for
  // an account they have already chosen.
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (user) return NextResponse.redirect(`${origin}${next}`);

  const { data, error } = await supabase.auth.signInWithOAuth({
    provider: 'google',
    options: { redirectTo: `${origin}/auth/callback?next=${encodeURIComponent(next)}` },
  });

  if (error || !data.url) {
    return NextResponse.redirect(`${origin}/acceso?error=oauth_start_failed`);
  }

  return NextResponse.redirect(data.url);
}
