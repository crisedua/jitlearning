/**
 * Supabase client bound to the request's cookies.
 *
 * This is the one to use for anything that acts *as the signed-in learner*:
 * reading their profile, their sessions, their plan. It carries their access
 * token, so row-level security applies — a bug here can leak that learner's own
 * data back to them, not anyone else's.
 *
 * For writes the learner must not be able to forge (usage rows, plan changes),
 * use `src/lib/supabase/admin.ts` instead.
 */
import { createServerClient } from '@supabase/ssr';
import { cookies } from 'next/headers';
import { anonKey, authConfigured, supabaseUrl } from './env';

export { authConfigured };

export async function createClient() {
  const cookieStore = await cookies();

  return createServerClient(supabaseUrl(), anonKey(), {
    cookies: {
      getAll: () => cookieStore.getAll(),
      setAll: (toSet) => {
        try {
          for (const { name, value, options } of toSet) {
            cookieStore.set(name, value, options);
          }
        } catch {
          // Server Components cannot set cookies. Harmless: the middleware
          // refreshes the session on every request, so the rotated token is
          // written there instead of being lost.
        }
      },
    },
  });
}

/**
 * The signed-in user, or null.
 *
 * Always `getUser()`, never `getSession()`: the session comes straight from the
 * cookie, which the browser controls. `getUser()` revalidates the token with
 * Supabase, so it is the only one of the two that can gate anything.
 *
 * Returns null rather than throwing when Supabase is unconfigured — an
 * environment that cannot verify anybody must treat everybody as signed out.
 */
export async function currentUser() {
  if (!authConfigured()) return null;
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  return user;
}
