/**
 * Supabase configuration, read from the environment.
 *
 * Separate from the clients so that a CLI script can reach it without dragging
 * in `next/headers`, which only exists inside a request.
 */

export function supabaseUrl(): string {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  if (!url) throw new Error('NEXT_PUBLIC_SUPABASE_URL is not set.');
  return url;
}

export function anonKey(): string {
  const key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!key) throw new Error('NEXT_PUBLIC_SUPABASE_ANON_KEY is not set.');
  return key;
}

/**
 * Whether the project URL is one `createClient` will accept.
 *
 * Set is not the same as usable, and the difference is not cosmetic here:
 * `createClient` throws "Invalid supabaseUrl: Must be a valid HTTP or HTTPS URL"
 * from its constructor, so a value with no scheme does not degrade, it raises.
 * Roughly twenty call sites in this codebase are written as
 * `if (!serviceConfigured()) return <something harmless>`, and every one of them
 * was reading "configured" as "safe to build a client", which it was not.
 *
 * What that cost: one mistyped variable in Vercel and `syncProfile` throws
 * inside `/auth/callback`, so a successful Google sign-in ends in a 500 and
 * nobody can get in at all. The same mistake used to stop `npm run doctor`
 * mid-run, which is how it was found, and the doctor was fixed on its own while
 * the thing it was diagnosing kept the bug.
 *
 * Answering it here means the existing guards do what they already look like
 * they do, rather than twenty call sites each learning to catch a constructor.
 */
function urlUsable(): boolean {
  const raw = process.env.NEXT_PUBLIC_SUPABASE_URL?.trim();
  if (!raw) return false;
  try {
    const parsed = new URL(raw);
    return parsed.protocol === 'https:' || parsed.protocol === 'http:';
  } catch {
    return false;
  }
}

/** Enough configuration for someone to sign in. */
export function authConfigured(): boolean {
  return urlUsable() && Boolean(process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY);
}

/** Enough configuration to write profiles and usage rows. */
export function serviceConfigured(): boolean {
  return urlUsable() && Boolean(process.env.SUPABASE_SERVICE_ROLE_KEY);
}
