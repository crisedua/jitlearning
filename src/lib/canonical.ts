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

/** The host part of the canonical origin, or null. */
export function canonicalHost(): string | null {
  const origin = configuredOrigin();
  if (!origin) return null;
  try {
    return new URL(origin).host;
  } catch {
    return null;
  }
}
