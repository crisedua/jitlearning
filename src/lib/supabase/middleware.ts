/**
 * Session refresh for the middleware.
 *
 * The dance with two response objects is required by `@supabase/ssr`: cookies
 * set during the refresh have to end up on the response that is actually
 * returned, and creating a fresh `NextResponse` later would discard them.
 */
import { createServerClient } from '@supabase/ssr';
import { NextResponse, type NextRequest } from 'next/server';

export async function updateSession(request: NextRequest): Promise<NextResponse> {
  let response = NextResponse.next({ request });

  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  // Unconfigured deployment: there is no session to refresh, and throwing here
  // would take down every route including the pages that explain the problem.
  if (!url || !key) return response;

  const supabase = createServerClient(url, key, {
    cookies: {
      getAll: () => request.cookies.getAll(),
      setAll: (toSet) => {
        for (const { name, value } of toSet) request.cookies.set(name, value);
        response = NextResponse.next({ request });
        for (const { name, value, options } of toSet) {
          response.cookies.set(name, value, options);
        }
      },
    },
  });

  // Do not remove: this call is what performs the refresh. Nothing else in the
  // middleware touches auth, so dropping it silently expires everyone.
  await supabase.auth.getUser();

  return response;
}
