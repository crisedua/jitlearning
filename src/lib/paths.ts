/**
 * Where a learner may be sent after signing in.
 *
 * `next` / `callbackUrl` arrive in a query string, which anyone can write.
 * Without this check the sign-in link doubles as an open redirect: our domain
 * in the address bar, someone else's page underneath it. Only same-site paths
 * survive.
 */
export function safeReturnPath(raw: string | null | undefined): string {
  if (!raw || !raw.startsWith('/') || raw.startsWith('//')) return '/coach';
  return raw;
}

/**
 * Where to send someone who is not signed in.
 *
 * Straight into the Google handshake, not to a page that asks them to click
 * "sign in" again — they already clicked something. `/acceso` exists only for
 * when that handshake cannot start or comes back with an error.
 */
export function signInPath(returnTo: string): string {
  return `/auth/login?next=${encodeURIComponent(returnTo)}`;
}
