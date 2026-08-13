'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';

/**
 * The "find new pains" button: picks a scope, runs the LLM radar server-side,
 * and reports rows-plus-cost rather than a bare checkmark — "it worked" and
 * "it wrote nine rows for eleven cents" are different claims, and only the
 * second is checkable.
 */
const SCOPES = [
  { value: 'all', label: 'Todos los mercados' },
  { value: 'cl', label: 'Chile' },
  { value: 'latam', label: 'Latinoamérica' },
  { value: 'en', label: 'Foros en inglés' },
] as const;

export function RadarLlmButton({ disponible }: { disponible: boolean }) {
  const router = useRouter();
  const [scope, setScope] = useState<string>('all');
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState<{ ok: boolean; message: string } | null>(null);

  if (!disponible) {
    return (
      <p className="rounded-md border border-dashed border-line-strong px-4 py-3 text-sm text-soft">
        El radar IA está apagado: falta configurar{' '}
        <code className="font-mono text-xs">OPENAI_API_KEY</code> en este despliegue.
      </p>
    );
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-3">
        <label className="flex items-center gap-2 text-sm text-muted">
          Buscar en
          <select
            value={scope}
            onChange={(e) => setScope(e.target.value)}
            disabled={busy}
            className="rounded-md border border-field bg-surface px-3 py-2 text-[15px] text-ink focus:border-accent focus:outline-none focus:ring-4 focus:ring-accent-soft"
          >
            {SCOPES.map((s) => (
              <option key={s.value} value={s.value}>
                {s.label}
              </option>
            ))}
          </select>
        </label>

        <button
          disabled={busy}
          onClick={() => {
            setBusy(true);
            setResult(null);
            void fetch('/api/pain-radar', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ scope }),
            })
              .then(async (res) => {
                const data = (await res.json()) as {
                  ok?: boolean;
                  stored?: number;
                  dropped?: number;
                  costoUsd?: number;
                  notas?: string[];
                  error?: string;
                };
                if (!res.ok || !data.ok) throw new Error(data.error ?? 'La búsqueda falló.');
                const notas = data.notas?.length ? ` ${data.notas.join(' ')}` : '';
                setResult({
                  ok: true,
                  message: `${data.stored} señal(es) nuevas en el radar (${data.dropped} descartadas por evidencia débil) · ~US$${data.costoUsd}.${notas}`,
                });
                router.refresh();
              })
              .catch((err: unknown) => {
                setResult({
                  ok: false,
                  message: err instanceof Error ? err.message : 'La búsqueda falló.',
                });
              })
              .finally(() => setBusy(false));
          }}
          className="inline-flex items-center gap-2.5 rounded-full bg-accent px-6 py-3 text-[16px] font-medium text-bg transition duration-200 ease-out hover:-translate-y-0.5 hover:bg-accent-hover disabled:translate-y-0 disabled:opacity-55"
        >
          {busy ? 'Buscando dolores… (~2 min)' : 'Buscar dolores nuevos (IA)'}
        </button>
      </div>

      <p className="text-[13px] leading-relaxed text-soft">
        Tarda alrededor de 2 minutos: la IA hace 10–12 búsquedas web reales, verifica cada URL y
        descarta lo que no pasa la compuerta de evidencia. No cierres la página mientras corre.
      </p>

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
