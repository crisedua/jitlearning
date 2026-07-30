/**
 * Keeps the Supabase session alive across requests.
 *
 * Access tokens are short-lived. Without a refresh on each request the learner
 * gets signed out mid-session — and, worse, Server Components cannot write
 * cookies, so a token rotated during a page render would be dropped on the
 * floor. This is the one place in the request path that can both refresh and
 * persist it.
 *
 * It only refreshes. Every gate that decides who may do what lives in the page
 * or route handler that does the thing, where it can be read next to the code
 * it protects.
 */
import { NextResponse, type NextRequest } from 'next/server';
import { updateSession } from '@/lib/supabase/middleware';

export async function middleware(request: NextRequest) {
  /*
   * Rescue an auth code that landed on the home page.
   *
   * When the `redirect_to` we send is not on Supabase's own allowlist, Supabase
   * silently ignores it and delivers the code to the project's Site URL
   * instead — the bare origin, with no path. The code is then sitting on a page
   * that does nothing with it, the learner never gets a session, and clicking
   * "Hablar con el coach" sends them back through Google forever. The loop is
   * indistinguishable from a broken login.
   *
   * Forward it to the route that knows what to do with it. This only fires on
   * `/` so it cannot swallow a `code` parameter meant for anything else, and it
   * only works when the flow began on this same origin — the PKCE verifier
   * cookie is what makes the exchange possible, and that is domain-bound.
   *
   * Fixing the allowlist is still the right fix; this stops a misconfiguration
   * from looking like a bug in sign-in.
   */
  const code = request.nextUrl.searchParams.get('code');
  if (code && request.nextUrl.pathname === '/') {
    const url = request.nextUrl.clone();
    url.pathname = '/auth/callback';
    return NextResponse.redirect(url);
  }

  return updateSession(request);
}

export const config = {
  matcher: [
    /*
     * Everything except static assets and image files — those never carry a
     * session and refreshing on each one would multiply auth traffic by every
     * icon on the page.
     */
    '/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp|ico)$).*)',
  ],
};
