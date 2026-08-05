/**
 * Who may see the operator pages.
 *
 * Identity-based rather than a shared secret. `/knowledge` is gated by
 * `INGEST_SECRET`, which is right for a tool driven by scripts — but a page
 * showing what the business costs should be tied to a person, so that revoking
 * access means removing an address rather than rotating a password everyone
 * has to be told about.
 *
 * The address is compared against Supabase's `getUser()`, which revalidates the
 * token with Supabase on every call. A cookie the browser controls is never
 * enough on its own: `getSession()` would read the claim straight out of it.
 *
 * Set `ADMIN_EMAILS` (comma-separated) to change or extend this without a
 * deploy. The fallback exists so the page is reachable on a deployment where
 * that variable was never set — losing access to your own cost dashboard
 * because of a missing environment variable is a bad failure mode, and the
 * fallback address is the owner's.
 */
import { currentUser } from './supabase/server';

const FALLBACK_ADMINS = ['eduardo@eduescalante.com'];

/** Everyone allowed into the operator pages, lowercased. */
export function adminEmails(): string[] {
  const configured = process.env.ADMIN_EMAILS?.split(',')
    .map((entry) => entry.trim().toLowerCase())
    .filter(Boolean);

  return configured && configured.length > 0 ? configured : FALLBACK_ADMINS;
}

export function isAdminEmail(email: string | null | undefined): boolean {
  if (!email) return false;
  return adminEmails().includes(email.trim().toLowerCase());
}

export type AdminCheck =
  | { ok: true; email: string }
  /** Not signed in at all — send them to sign in, then back here. */
  | { ok: false; reason: 'anonymous' }
  /** Signed in as somebody else. Say so; do not pretend the page is missing. */
  | { ok: false; reason: 'forbidden'; email: string | null };

/**
 * The gate itself. Returns rather than throws, so the caller decides between
 * redirecting and rendering an explanation — the two cases deserve different
 * answers, and a signed-in learner who lands here by accident should be told
 * plainly instead of bounced through a login they already completed.
 */
export async function checkAdmin(): Promise<AdminCheck> {
  const user = await currentUser();
  if (!user) return { ok: false, reason: 'anonymous' };

  const email = user.email ?? null;
  if (!isAdminEmail(email)) return { ok: false, reason: 'forbidden', email };

  return { ok: true, email: email as string };
}
