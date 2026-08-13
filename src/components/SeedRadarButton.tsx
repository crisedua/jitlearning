'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';

/**
 * One button, three states. The result is reported as a number of rows rather
 * than a checkmark, because "it worked" and "it wrote sixteen rows" are
 * different claims and only the second one is checkable.
 */
export function SeedRadarButton({ count }: { count: number }) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState<{ ok: boolean; message: string } | null>(null);

  return (
    <div className="space-y-4">
      <button
        disabled={busy}
        onClick={() => {
          setBusy(true);
          setResult(null);
          void fetch('/api/pain-seed', { method: 'POST' })
            .then(async (res) => {
              const data = (await res.json()) as {
                ok?: boolean;
                stored?: number;
                error?: string;
              };
              if (!res.ok || !data.ok) throw new Error(data.error ?? 'No se pudo cargar.');
              setResult({
                ok: true,
                message: `${data.stored} señal(es) cargadas y publicadas. El coach ya puede buscarlas.`,
              });
              // Refresh the server component so the count above reflects the write.
              router.refresh();
            })
            .catch((err: unknown) => {
              setResult({
                ok: false,
                message: err instanceof Error ? err.message : 'No se pudo cargar.',
              });
            })
            .finally(() => setBusy(false));
        }}
        className="inline-flex items-center gap-2.5 rounded-full bg-accent px-6 py-3 text-[16px] font-medium text-bg transition duration-200 ease-out hover:-translate-y-0.5 hover:bg-accent-hover disabled:translate-y-0 disabled:opacity-55"
      >
        {busy ? 'Cargando…' : count > 0 ? 'Recargar el radar' : 'Cargar el radar'}
      </button>

      {result && (
        <p
          role="status"
          className={`rounded-md border px-4 py-3 text-sm leading-relaxed ${
            result.ok
              ? 'border-success/25 bg-success-soft/60 text-ink/85'
              : 'border-danger/25 bg-danger-soft/60 text-ink/85'
          }`}
        >
          {result.message}
        </p>
      )}
    </div>
  );
}
