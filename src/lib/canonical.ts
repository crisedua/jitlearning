/**
 * One answer to "what is this deployment's public address".
 *
 * There were three, which is two too many for a fact that has to be identical in
 * four places or sign-in and checkout break:
 *
 *   NEXT_PUBLIC_SITE_URL   read by `siteOrigin()`, and so by the OAuth
 *                          `redirect_to`, Stripe's success and cancel URLs, and
 *                          the billing portal's return URL
 *   PUBLIC_BASE_URL        read by `setup-tools` for the search tool's endpoint,
 *                          and by the middleware's canonical-host redirect
 *   a compiled default     the domain hardcoded in `setup-tools`
 *
 * Setting one did not set the others. An operator who put the right value in
 * `NEXT_PUBLIC_SITE_URL` got correct OAuth and Stripe URLs, no canonical
 * redirect, and a search tool still pointing at whatever was compiled in — three
 * different opinions about the same deployment, none of them wrong on its own.
 *
 * Both names still work, so nothing already configured breaks.
 * `NEXT_PUBLIC_SITE_URL` wins because it is the one that already had to be right
 * for sign-in to work at all.
 *
 * No `next/headers` import here on purpose: the middleware runs on the edge and
 * `setup-tools` runs in a plain Node script, and both need this.
 */

/**
 * Where this product is served from, when nothing says otherwise.
 *
 * `setup-tools` has always fallen back to this literal for the search tool's
 * endpoint, so the repo already declares a canonical origin — it just declared
 * it in one place and let the redirect that protects sign-in wait on a variable
 * nobody had set.
 *
 * A fork deploying elsewhere sets NEXT_PUBLIC_SITE_URL, which is the same thing
 * it already has to do for the tool endpoint to point anywhere useful.
 */
export const DEFAULT_ORIGIN = 'https://www.modojit.com';

/** The configured canonical origin, normalised, or null when unset or unusable. */
export function configuredOrigin(): string | null {
  const raw =
    process.env.NEXT_PUBLIC_SITE_URL?.trim() || process.env.PUBLIC_BASE_URL?.trim() || '';
  if (!raw) return null;

  try {
    const url = new URL(raw);
    // Origin only. A trailing path here would be concatenated into every URL
    // built from it, and the failure would look like a routing bug.
    return `${url.protocol}//${url.host}`;
  } catch {
    return null;
  }
}

/**
 * The host every request should be served from, or null when there is nothing
 * to compare against.
 *
 * Falls back to `DEFAULT_ORIGIN` rather than to nothing, because the redirect
 * this feeds is what stops a second hostname from breaking sign-in — and an
 * inert safety mechanism protects nobody. This app answers on its custom domain
 * and on the `.vercel.app` alias; Supabase allow-lists OAuth redirect URLs one
 * at a time, and a flow begun on the wrong one cannot be completed on the other,
 * because the PKCE verifier is a cookie. Which link somebody was sent decided
 * whether they could sign in at all.
 *
 * `configuredOrigin()` still wins, and `siteOrigin()` still prefers the
 * forwarded headers over this: guessing an origin for a generated URL is a
 * different and worse thing than refusing to serve a second one.
 */
export function canonicalHost(): string | null {
  const origin = configuredOrigin() ?? DEFAULT_ORIGIN;
  if (!origin) return null;
  try {
    return new URL(origin).host;
  } catch {
    return null;
  }
}
