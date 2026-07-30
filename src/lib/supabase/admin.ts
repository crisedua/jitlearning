/**
 * Service-role Supabase client. Bypasses row-level security entirely.
 *
 * Server-only, and deliberately narrow in use: recording usage and reading
 * plans — writes the learner must not be able to forge. Their browser reports
 * how long a conversation lasted, so if that write went through their own
 * token, minutes would be self-declared.
 *
 * Never import this into a client component. The key it reads has no
 * `NEXT_PUBLIC_` prefix precisely so that a slip like that fails at build time
 * rather than shipping the key to the browser.
 */
import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import { serviceConfigured, supabaseUrl } from './env';

let cached: SupabaseClient | null = null;

export { serviceConfigured };

export function supabaseAdmin(): SupabaseClient {
  if (cached) return cached;

  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!key) throw new Error('SUPABASE_SERVICE_ROLE_KEY is not set.');

  cached = createClient(supabaseUrl(), key, {
    // No cookies, no refresh loop, no persisted session: this client is not a
    // user and must never pick one up from ambient storage.
    auth: { persistSession: false, autoRefreshToken: false },
  });
  return cached;
}
