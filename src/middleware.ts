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
import { canonicalHost } from '@/lib/canonical';

/**
 * The one host sign-in is allowed to begin on, when there is more than one.
 *
 * This app answers on its custom domain and on the `.vercel.app` alias, and both
 * serve the same deployment. That is fine for reading and a trap for signing in:
 * Supabase allow-lists redirect URLs one at a time, so a flow begun on the alias
 * asks to come back to an address the project may not accept. Supabase then
 * delivers the code to the project's Site URL instead — the other domain — and
 * the rescue below cannot finish it, because the PKCE verifier is a cookie and
 * cookies are bound to the origin that set them.
 *
 * The result is a sign-in that fails only for people who arrived by the alias,
 * which is exactly the link somebody pastes into a message when the custom
 * domain has not been front of mind.
 *
 * The origin comes from `canonical.ts`, the same resolution the search tool and
 * every generated URL use. Unset, this does nothing at all. Production only — a
 * preview deployment has to stay on its own hostname to be testable.
 */
function redirectHost(): string | null {
  return process.env.VERCEL_ENV === 'production' ? canonicalHost() : null;
}

export async function middleware(request: NextRequest) {
  const canonical = redirectHost();
  const host = request.headers.get('host');
  if (canonical && host && host !== canonical) {
    const url = request.nextUrl.clone();
    url.host = canonical;
    url.port = '';
    url.protocol = 'https:';
    // 308: permanent, and preserves the method, so nothing posted is turned
    // into a GET on the way across.
    return NextResponse.redirect(url, 308);
  }

  /*
   * Rescue an auth code that landed on the home page.
   *
   * When the `redirect_to` we send is not on Supabase's own allowlist, Supabase
   * silently ignores it and delivers the code to the project's Site URL
   * instead — the bare origin, with no path. The code is then sitting on a page
   * that does nothing with it, the learner never gets a session, and clicking
   * the call-to-action sends them back through Google forever. The loop is
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
     *
     * `robots.txt` and `sitemap.xml` belong on that list for the same reason and
     * were not on it, because they were added after this line. They are fetched
     * by crawlers, which have no session to refresh, and a crawler is exactly the
     * client that will ask for them repeatedly and never benefit.
     */
    '/((?!_next/static|_next/image|favicon.ico|robots.txt|sitemap.xml|.*\\.(?:svg|png|jpg|jpeg|gif|webp|ico)$).*)',
  ],
};
