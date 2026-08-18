'use client';

import { usePathname } from 'next/navigation';
import { useState } from 'react';
import { signInPath } from '@/lib/paths';

/**
 * "Administrar mi plan", which opens Stripe's billing portal.
 *
 * The portal is where a card gets updated, an invoice gets downloaded, and a
 * subscription gets cancelled. Putting it one click from the progress page is not
 * generosity: a product that makes cancelling hard gets cancelled by chargeback
 * instead, and in most of the places this is sold, hiding it is not lawful.
 *
 * ## An expired session used to strand somebody here
 *
 * The route answers 401 when the cookie has aged out while the page stayed open,
 * and this rendered "inicia sesión para ver tu suscripción" as a dead sentence.
 * `CheckoutButton` meets the same 401 by sending them through Google and back to
 * where they were, so one situation had two behaviours — and the stranded one
 * was on the path where being stuck is a legal problem as well as a commercial
 * one. Somebody who cannot reach the portal cancels through their bank instead.
 */
export function BillingLink() {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const here = usePathname();

  async function open() {
    setBusy(true);
    setError(null);
    try {
      const res = await fetch('/api/billing/portal', { method: 'POST' });

      // The session aged out while the page was open. Nothing here can renew it,
      // so send them through sign-in and back rather than explaining it.
      if (res.status === 401) {
        window.location.href = signInPath(here || '/progreso');
        return;
      }

      const data = (await res.json()) as { url?: string; error?: string };
      if (!res.ok || !data.url) throw new Error(data.error ?? 'No pudimos abrirlo.');
      window.location.href = data.url;
    } catch (err) {
      setError(err instanceof Error ? err.message : 'No pudimos abrirlo.');
      setBusy(false);
    }
  }

  return (
    <>
      <button
        onClick={() => void open()}
        disabled={busy}
        className="text-[14px] font-medium text-accent underline underline-offset-2 transition-colors duration-150 ease-out hover:text-accent-hover disabled:opacity-60"
      >
        {busy ? 'Abriendo…' : 'Administrar mi plan'}
      </button>
      {error && (
        <p role="alert" className="mt-1 text-[13px] text-danger">
          {error}
        </p>
      )}
    </>
  );
}
