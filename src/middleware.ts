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
import { type NextRequest } from 'next/server';
import { updateSession } from '@/lib/supabase/middleware';

export async function middleware(request: NextRequest) {
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
