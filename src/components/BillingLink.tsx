'use client';

import { useState } from 'react';

/**
 * "Administrar mi plan", which opens Stripe's billing portal.
 *
 * The portal is where a card gets updated, an invoice gets downloaded, and a
 * subscription gets cancelled. Putting it one click from the progress page is not
 * generosity: a product that makes cancelling hard gets cancelled by chargeback
 * instead, and in most of the places this is sold, hiding it is not lawful.
 */
export function BillingLink() {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function open() {
    setBusy(true);
    setError(null);
    try {
      const res = await fetch('/api/billing/portal', { method: 'POST' });
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
