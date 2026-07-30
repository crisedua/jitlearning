/**
 * The public origin of this deployment, as the browser sees it.
 *
 * OAuth redirect URIs must match exactly what was registered, so guessing wrong
 * here is not a cosmetic problem — the sign-in round trip fails at the last
 * step. The forwarded headers are what a proxy (Vercel included) rewrites, so
 * they beat the raw host.
 *
 * `NEXT_PUBLIC_SITE_URL` overrides everything, for the case where the app sits
 * behind something that does not forward honestly.
 */
import { headers } from 'next/headers';

export async function siteOrigin(): Promise<string> {
  const configured = process.env.NEXT_PUBLIC_SITE_URL?.trim().replace(/\/+$/, '');
  if (configured) return configured;

  const h = await headers();
  const host = h.get('x-forwarded-host') ?? h.get('host') ?? 'localhost:3000';
  const proto = h.get('x-forwarded-proto') ?? (host.startsWith('localhost') ? 'http' : 'https');
  return `${proto}://${host}`;
}
