'use client';

import { useState } from 'react';

/**
 * The button that takes money.
 *
 * It posts to `/api/checkout` and follows the URL Stripe returns. It never
 * touches the plan itself: the redirect is to Stripe's page, and the upgrade
 * happens when Stripe's webhook says the payment went through.
 *
 * ## The signed-out case is handled, not blocked
 *
 * A visitor comparing prices has usually not signed in. The route answers 401 and
 * this sends them through Google with `next` pointing back at the pricing page, so
 * they land where they were rather than on the home page wondering what happened.
 * Losing somebody at the moment they decided to pay is the most expensive failure
 * a pricing page has.
 */
export function CheckoutButton({
  plan,
  label,
  recommended,
}: {
  plan: string;
  label: string;
  recommended: boolean;
}) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function start() {
    setBusy(true);
    setError(null);
    try {
      const res = await fetch('/api/checkout', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ plan }),
      });

      if (res.status === 401) {
        window.location.href = `/auth/login?next=${encodeURIComponent('/planes')}`;
        return;
      }

      const data = (await res.json()) as { url?: string; error?: string };
      if (!res.ok || !data.url) throw new Error(data.error ?? 'No pudimos abrir el pago.');

      // Stripe's hosted page. Full navigation, not a popup: popups get blocked and
      // a blocked payment window is indistinguishable from a broken button.
      window.location.href = data.url;
    } catch (err) {
      setError(err instanceof Error ? err.message : 'No pudimos abrir el pago.');
      setBusy(false);
    }
  }

  return (
    <>
      <button
        onClick={() => void start()}
        disabled={busy}
        className={`mt-7 inline-flex w-full items-center justify-center rounded-full px-5 py-2.5 text-[15px] font-medium transition duration-200 ease-out hover:-translate-y-0.5 disabled:translate-y-0 disabled:opacity-60 ${
          recommended
            ? 'bg-accent text-bg hover:bg-accent-hover'
            : 'border border-line-strong text-ink hover:border-accent hover:text-accent'
        }`}
      >
        {busy ? 'Abriendo el pago…' : label}
      </button>

      {error && (
        <p role="alert" className="mt-2 text-[13px] leading-relaxed text-danger">
          {error}
        </p>
      )}
    </>
  );
}
