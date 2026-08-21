'use client';

import { connectionMessage } from '@/lib/errors';
import { usePathname } from 'next/navigation';
import { useState } from 'react';
import { signInPath } from '@/lib/paths';

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
 * this sends them through Google with `next` pointing back at the page they were
 * on, so they land where they were rather than on the home page wondering what
 * happened. Losing somebody at the moment they decided to pay is the most
 * expensive failure a pricing page has.
 *
 * That return path used to be the string `/planes` while the comment beside it
 * claimed they land where they were. Harmless while this only rendered on the
 * pricing page, and quietly wrong the moment it did not: the offer on `/progreso`
 * is made next to the learner's own measured hours, and bouncing them to a
 * comparison table throws away the one thing that convinced them.
 */
/**
 * How long a request may hang before it is treated as failed.
 *
 * Without this, `fetch` waits forever on a connection that stalls after the
 * handshake — a captive portal, a proxy that accepts and never answers — and the
 * button stays disabled reading its busy label with nothing to press. The
 * learner cannot retry, because retrying is the button.
 *
 * Fifteen seconds is far past a healthy round trip and short enough that nobody
 * is left watching a word. An abort surfaces as `AbortError`, which
 * `connectionMessage` already turns into "la conexión tardó demasiado" — the
 * sentence existed before anything could produce it.
 *
 * Optional-called: `AbortSignal.timeout` is missing on older Safari, and there
 * the behaviour is what it was before this line.
 */
const REQUEST_TIMEOUT_MS = 15_000;

export function CheckoutButton({
  plan,
  label,
  recommended,
  provider = 'stripe',
}: {
  plan: string;
  label: string;
  recommended: boolean;
  /**
   * Which rail to open.
   *
   * Two routes, one button. The flow is identical from here — post a plan id,
   * get back a URL, navigate to it — and the only thing that differs is which
   * hosted page the learner lands on, so duplicating the component would
   * duplicate the timeout, the 401 redirect and the error handling for the sake
   * of one string.
   */
  provider?: 'stripe' | 'mercadopago';
}) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const here = usePathname();

  async function start() {
    setBusy(true);
    setError(null);
    try {
      const res = await fetch(
        provider === 'mercadopago' ? '/api/checkout/mercadopago' : '/api/checkout',
        {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ plan }),
        signal: AbortSignal.timeout?.(REQUEST_TIMEOUT_MS),
        },
      );

      if (res.status === 401) {
        window.location.href = signInPath(here || '/planes');
        return;
      }

      const data = (await res.json()) as { url?: string; error?: string };
      if (!res.ok || !data.url) throw new Error(data.error ?? 'No pudimos abrir el pago.');

      // The provider's hosted page. Full navigation, not a popup: popups get
      // blocked and a blocked payment window is indistinguishable from a broken
      // button.
      window.location.href = data.url;
    } catch (err) {
      setError(
        connectionMessage(err) ??
          (err instanceof Error ? err.message : 'No pudimos abrir el pago.'),
      );
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
